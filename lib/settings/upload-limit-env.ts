/** Fallback when `ORIGAMI_MAX_UPLOAD_MB` is unset (10 GB). */
export const DEFAULT_MAX_UPLOAD_MB = 10240;

/** Ops-configured ceiling from the environment (also the default when unset in DB). */
export function maxUploadMbFromEnv(): number {
  const mb = Number(
    process.env.ORIGAMI_MAX_UPLOAD_MB || String(DEFAULT_MAX_UPLOAD_MB),
  );
  return Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_MAX_UPLOAD_MB;
}

/** Next.js body limits need a little headroom for multipart boundaries. */
export function maxUploadBodyLimitFromEnv(): `${number}mb` {
  return `${maxUploadMbFromEnv() + 1}mb`;
}
