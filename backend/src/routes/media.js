import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { rateLimit } from "express-rate-limit";
import cloudinary from "../cloudinary.js";
import { requireRole, requireTrustedOrigin } from "../auth.js";

const extensionsByMime = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 0
  }
});

const uploadLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_request, response) => response.status(429).json({
    error: {
      code: "UPLOAD_RATE_LIMITED",
      message: "Too many image uploads. Try again later."
    }
  })
});

function uploadToCloudinary(buffer, fileName) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "hunarhub/entrepreneur-images",
        public_id: fileName,
        resource_type: "image",
        overwrite: false
      },
      (error, result) => {
        if (error) return reject(error);
        return resolve(result);
      }
    );

    stream.end(buffer);
  });
}

export const mediaRouter = Router();

mediaRouter.post(
  "/entrepreneur/images",
  requireTrustedOrigin,
  requireRole("entrepreneur"),
  uploadLimit,
  (request, response, next) => {
    upload.single("image")(request, response, (error) => {
      if (error) {
        if (error instanceof multer.MulterError) {
          const tooLarge = error.code === "LIMIT_FILE_SIZE";
          return response.status(tooLarge ? 413 : 400).json({
            error: {
              code: tooLarge ? "IMAGE_TOO_LARGE" : "INVALID_UPLOAD",
              message: tooLarge
                ? "Images must be 5 MB or smaller."
                : "Upload one supported image at a time."
            }
          });
        }

        return next(error);
      }

      return next();
    });
  },
  async (request, response, next) => {
    if (!request.file) {
      return response.status(400).json({
        error: {
          code: "IMAGE_REQUIRED",
          message: "Choose an image to upload."
        }
      });
    }

    try {
      const detectedType = await fileTypeFromBuffer(request.file.buffer);
      const extension = detectedType && extensionsByMime.get(detectedType.mime);

      if (!extension) {
        return response.status(400).json({
          error: {
            code: "UNSUPPORTED_IMAGE",
            message: "Use a JPEG, PNG, or WebP image. SVG and other file types are not accepted."
          }
        });
      }

      const fileName = randomUUID();
      const result = await uploadToCloudinary(request.file.buffer, fileName);

      return response.status(201).json({
        imageUrl: result.secure_url,
        publicId: result.public_id,
        contentType: detectedType.mime,
        sizeBytes: request.file.size
      });
    } catch (error) {
      return next(error);
    }
  }
);
