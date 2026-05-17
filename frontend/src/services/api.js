/**
 * Backend API client.
 *
 * Wraps axios so the rest of the app doesn't have to know about
 * envelope shapes or status code semantics. Every call resolves with
 * `response.data.data` on success and throws a normalised Error
 * (with `.status`, `.code`, `.requestId`) on failure.
 *
 * In dev, Vite proxies /api -> http://localhost:3000 (see vite.config.js),
 * so the same code works in dev and prod without env switching.
 */

import axios from 'axios';

const client = axios.create({
  baseURL: '/api/v1',
  timeout: 30_000,
});

const unwrap = (response) => response?.data?.data;

const toFriendlyError = (err) => {
  // Network / timeout / no-response cases.
  if (!err.response) {
    const wrapped = new Error(err.message || 'Network error');
    wrapped.status = 0;
    wrapped.code = 'NETWORK_ERROR';
    return wrapped;
  }
  const { status, data } = err.response;
  const wrapped = new Error(data?.error?.message || `Request failed (${status})`);
  wrapped.status = status;
  wrapped.code = data?.error?.code;
  wrapped.details = data?.error?.details;
  wrapped.requestId = data?.requestId;
  return wrapped;
};

/**
 * Upload a single image.
 *
 * @param {File} file
 * @param {(percent: number) => void} [onProgress]
 * @returns {Promise<{ imageId: string, status: string, uploadedAt: string }>}
 */
export const uploadImage = async (file, onProgress) => {
  const form = new FormData();
  form.append('image', file);
  try {
    const response = await client.post('/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (!onProgress || !event.total) return;
        onProgress(Math.round((event.loaded / event.total) * 100));
      },
    });
    return unwrap(response);
  } catch (err) {
    throw toFriendlyError(err);
  }
};

/**
 * Fetch the lifecycle status of a job. Cheap — safe to poll.
 *
 * @param {string} imageId
 */
export const getStatus = async (imageId) => {
  try {
    const response = await client.get(`/status/${imageId}`);
    return unwrap(response);
  } catch (err) {
    throw toFriendlyError(err);
  }
};

/**
 * Fetch the full analysis payload. Only meaningful once status is
 * `completed` or `failed`.
 *
 * @param {string} imageId
 */
export const getResults = async (imageId) => {
  try {
    const response = await client.get(`/results/${imageId}`);
    return unwrap(response);
  } catch (err) {
    throw toFriendlyError(err);
  }
};

export default { uploadImage, getStatus, getResults };
