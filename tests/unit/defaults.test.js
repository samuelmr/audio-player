import { describe, test, expect } from 'vitest'
import { parseBucketUrl } from '../../src/defaults.js'

describe('the default bucket', () => {
  test('is the endpoint and the bucket of a path-style address', () => {
    expect(parseBucketUrl('https://s3.example.com/demo-music')).toEqual({
      endpoint: 'https://s3.example.com',
      bucketName: 'demo-music',
    })
  })

  test('may have a tenant in front of the bucket, and a slash after it', () => {
    expect(parseBucketUrl('https://s3.example.com/0123abcd:demo-music/')).toEqual({
      endpoint: 'https://s3.example.com',
      bucketName: '0123abcd:demo-music',
    })
  })

  test('keeps the port, and decodes the bucket', () => {
    expect(parseBucketUrl('http://127.0.0.1:9000/tenant%3Amusic')).toEqual({
      endpoint: 'http://127.0.0.1:9000',
      bucketName: 'tenant:music',
    })
  })

  test.each([undefined, ''])('is none without an address (%j)', (address) => {
    expect(parseBucketUrl(address)).toEqual({})
  })
})
