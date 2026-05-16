/**
 * Image processing record.
 *
 * One document per upload — created the moment the file lands on disk,
 * updated by the worker as the job progresses. `imageId` is the public
 * identifier returned to clients; the Mongo `_id` is internal.
 *
 * The `analysisResults` sub-document is intentionally loose so that
 * each feature (blur / brightness / OCR / number-plate / duplicate)
 * can fill in its own slot without coupling the schema to the order
 * in which features are implemented.
 */

import mongoose from 'mongoose';
import { JOB_STATUS, JOB_STATUS_VALUES } from '../utils/constants.js';

const { Schema } = mongoose;

/**
 * Structured analysis payload. Every field is optional — workers fill
 * in what they computed and leave the rest. Shapes mirror exactly
 * what each analyzer returns from src/services/* so the worker can
 * `$set: { analysisResults: { ... } }` without remapping.
 */
const analysisResultsSchema = new Schema(
  {
    dimensions: {
      validDimensions: { type: Boolean },
      width: { type: Number },
      height: { type: Number },
    },
    blur: {
      isBlurry: { type: Boolean },
      blurScore: { type: Number },
      threshold: { type: Number },
    },
    brightness: {
      brightnessLevel: { type: String }, // 'dark' | 'normal' | 'overexposed'
      brightnessScore: { type: Number }, // mean grayscale intensity (0-255)
    },
    ocr: {
      extractedText: { type: String }, // normalized text used downstream
      confidence: { type: Number }, // 0-100
      rawText: { type: String }, // unmodified tesseract output
    },
    plate: {
      isValidPlate: { type: Boolean },
      matchedPattern: { type: String }, // 'STANDARD' | 'BH_SERIES' | null
    },
    duplicate: {
      isDuplicate: { type: Boolean },
      imageHash: { type: String, index: true },
      matchedImageId: { type: String },
    },
  },
  { _id: false },
);

const imageSchema = new Schema(
  {
    /** Public, client-facing identifier (UUID v4). Stable across the job lifecycle. */
    imageId: { type: String, required: true, unique: true, index: true },

    /** Stored filename on disk (NOT the original name — that's preserved separately). */
    filename: { type: String, required: true },

    /** Original filename as uploaded by the client. */
    originalName: { type: String },

    /** Absolute path under UPLOAD_DIR. Workers read from here. */
    storagePath: { type: String, required: true },

    /** Detected MIME type — from the multer parse, not the client claim. */
    mimeType: { type: String },

    /** File size in bytes. */
    sizeBytes: { type: Number },

    /** Lifecycle status — one of JOB_STATUS_VALUES. */
    status: {
      type: String,
      enum: JOB_STATUS_VALUES,
      default: JOB_STATUS.PENDING,
      index: true,
    },

    /** BullMQ job id — populated once the job is enqueued. */
    jobId: { type: String, index: true },

    /** Set when the worker starts processing. */
    processingStartedAt: { type: Date },

    /** Set on terminal transition (completed or failed). */
    processedAt: { type: Date },

    /** Number of attempts made so far (0 until the worker picks it up). */
    attempts: { type: Number, default: 0 },

    /** Structured analysis payload — see sub-schema above. */
    analysisResults: { type: analysisResultsSchema, default: () => ({}) },

    /** Human-readable failure reason when status === 'failed'. */
    failureReason: { type: String },
  },
  {
    timestamps: { createdAt: 'uploadedAt', updatedAt: 'updatedAt' },
    versionKey: false,
  },
);

// Useful compound indexes for status dashboards / cleanup jobs.
imageSchema.index({ status: 1, uploadedAt: -1 });

export const ImageModel = mongoose.model('Image', imageSchema);
export default ImageModel;
