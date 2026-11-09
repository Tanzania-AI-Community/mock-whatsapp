import {
  constants,
  createCipheriv,
  createDecipheriv,
  publicEncrypt,
  randomBytes,
} from "node:crypto"

// Encrypts a Flow data-exchange request the way the WhatsApp client does:
// AES-128-GCM payload, RSA-OAEP (SHA-256) wrapped key
export function encryptFlowRequest(payload: unknown, publicKey: string) {
  const aesKey = randomBytes(16)
  const iv = randomBytes(16)
  const cipher = createCipheriv("aes-128-gcm", aesKey, iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ])
  const body = {
    encrypted_flow_data: encrypted.toString("base64"),
    encrypted_aes_key: publicEncrypt(
      {
        key: publicKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      aesKey
    ).toString("base64"),
    initial_vector: iv.toString("base64"),
  }
  return { body, aesKey, iv }
}

// Responses are encrypted with the same key and the bitwise-inverted IV
export function decryptFlowResponse(
  response: string,
  aesKey: Buffer,
  iv: Buffer
) {
  const data = Buffer.from(response, "base64")
  const decipher = createDecipheriv(
    "aes-128-gcm",
    aesKey,
    Buffer.from(iv.map((byte) => ~byte & 0xff))
  )
  decipher.setAuthTag(data.subarray(-16))
  const plain = Buffer.concat([
    decipher.update(data.subarray(0, -16)),
    decipher.final(),
  ])
  return JSON.parse(plain.toString("utf8")) as unknown
}
