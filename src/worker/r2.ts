import { AwsClient } from "aws4fetch";

type MediaEnv = Cloudflare.Env & R2Secrets;

export function hasUploadCredentials(env: MediaEnv): boolean {
  return Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY);
}

export async function createPresignedUploadUrl(env: MediaEnv, objectKey: string, contentType: string): Promise<string> {
  if (!hasUploadCredentials(env)) throw new Error("R2アップロード用secretが設定されていません");
  const aws = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });
  const url = new URL(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${objectKey}`);
  url.searchParams.set("X-Amz-Expires", "900");
  const signed = await aws.sign(new Request(url, { method: "PUT", headers: { "Content-Type": contentType } }), {
    aws: { signQuery: true },
  });
  return signed.url.toString();
}
