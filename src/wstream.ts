import stream from 'stream'
import IORedis, { Pipeline } from 'ioredis'

import { createHash, randomBytes, Hash } from 'crypto'

const RANDOM_BYTES_LENGTH = 15

export interface StreamOptions extends stream.WritableOptions {
  maxBytes?: number
  ttl?: number
  clientMulti?: Pipeline
  digestKey?: boolean
  algorithm?: string
}

export class RedisWStream extends stream.Writable {
  redisClient: IORedis.Redis
  redisKey: string | null
  redisTempKey: string
  redisMaxBytes?: number
  redisTTL?: number
  redisClientMulti?: Pipeline
  redisCrypto?: Hash
  redisDigest?: string
  redisLength: number

  constructor(redisClient: IORedis.Redis, key: string | null, { highWaterMark, clientMulti, algorithm, maxBytes, ttl }: StreamOptions = {}) {
    if (!(redisClient && (key || algorithm))) throw new Error('RedisWStream requires client, key or options.algorithm')
    super({ highWaterMark })

    this.redisClient = redisClient
    this.redisKey = key
    this.redisTempKey = 'RedisWStream.' + randomBytes(RANDOM_BYTES_LENGTH).toString('base64')
    this.redisMaxBytes = maxBytes
    this.redisTTL = ttl
    this.redisClientMulti = clientMulti
    this.redisLength = 0

    this.redisCrypto = algorithm && createHash(algorithm) || undefined
    this.redisClient.set(this.redisTempKey, '', error => {
      if (error) throw error
    })
  }

  _write(chunk: string | Buffer, encoding: BufferEncoding, cb: (error?: Error | null) => void): void {
    this.redisClient.append(this.redisTempKey, chunk, (error, length) => {
      if(error) return cb(error)
      this.redisLength = length
      this.redisCrypto?.update(chunk)
      this.redisMaxBytes && (length > this.redisMaxBytes)
        ? cb(new Error(`Write Stream exceeded maximum allowed length of ${this.redisMaxBytes} bytes`))
        : cb()
    })
  }

  _final(cb: (error?: Error | null) => void): void {
    this.redisDigest = this.redisCrypto?.digest('hex')
    const key = this.redisDigest || this.redisKey || this.redisTempKey

    const expire = (key: string, error: Error | null) => {
      if(error) return cb(error)
      this.redisTTL ? this.redisClient.expire(key, this.redisTTL, cb) : cb()
    }

    this.redisClientMulti?.rename(this.redisTempKey, key, error => expire(key, error))
      ? cb()
      : this.redisClient.rename(this.redisTempKey, key, error => expire(key, error))
  }

  _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    this.redisClient.del(this.redisTempKey, callback)
  }
}
