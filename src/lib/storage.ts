import { Client } from "@replit/object-storage";

let client: Client | undefined;

function getClient(): Client {
  if (!client) {
    client = new Client();
  }
  return client;
}

export async function uploadVideo(objectKey: string, contents: Buffer): Promise<void> {
  const { ok, error } = await getClient().uploadFromBytes(objectKey, contents);
  if (!ok) {
    throw new Error(`Object Storage upload failed: ${error.message}`);
  }
}

export async function downloadVideo(objectKey: string): Promise<Buffer> {
  const { ok, value, error } = await getClient().downloadAsBytes(objectKey);
  if (!ok) {
    throw new Error(`Object Storage download failed: ${error.message}`);
  }
  return value[0];
}

export async function deleteVideo(objectKey: string): Promise<void> {
  const { ok, error } = await getClient().delete(objectKey, { ignoreNotFound: true });
  if (!ok) {
    throw new Error(`Object Storage delete failed: ${error.message}`);
  }
}
