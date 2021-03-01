import IORedis from 'ioredis'
import { Readable, pipeline, ReadableOptions } from 'stream'
import { RedisRStream } from './rstream'
import { RedisWStream, StreamOptions } from './wstream'

export class StreamIORedis extends IORedis {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(...args: any[]) {
    super(...args)
  }

  readStream(key: string, options?: ReadableOptions): RedisRStream {
    return new RedisRStream(this, key, { highWaterMark: 1024 * 1024, ...options }) // 1 MB chunks
  }

  writeStream(key: string | null, options?: StreamOptions): RedisWStream {
    return new RedisWStream(this, key, { highWaterMark: 1024 * 1024, ...options }) // 1 MB chunks
  }

  writeStreamPromise(stream: Readable, key: string | null, options?: StreamOptions): Promise<RedisWStream> {
    const wstream = this.writeStream(key, options)
    return new Promise((resolve, reject) => {
      pipeline(stream, wstream, error => error ? reject(error) : resolve(wstream))
    })
  }
}