import { assert, expect } from 'aegir/chai'
import { Buffer } from 'buffer'
import { equals as uint8ArrayEquals } from 'uint8arrays/equals'
import { IK } from '../../src/handshakes/ik.js'
import type { KeyPair } from '../../src/@types/libp2p.js'
import { stablelib } from '../../src/crypto/stablelib.js'
import { createHandshakePayload, getHandshakePayload } from '../../src/utils.js'
import { generateEd25519Keys } from '../utils.js'

describe('IK handshake', () => {
  const prologue = Buffer.alloc(0)

  it('Test complete IK handshake', async () => {
    try {
      const ikI = new IK(stablelib)
      const ikR = new IK(stablelib)

      // Generate static noise keys
      const kpInitiator: KeyPair = stablelib.generateX25519KeyPair()
      const kpResponder: KeyPair = stablelib.generateX25519KeyPair()

      // Generate libp2p keys
      const libp2pInitKeys = await generateEd25519Keys()
      const libp2pRespKeys = await generateEd25519Keys()

      // Create sessions
      const initiatorSession = await ikI.initSession(true, prologue, kpInitiator, kpResponder.publicKey)
      const responderSession = await ikR.initSession(false, prologue, kpResponder, Buffer.alloc(32))

      /* Stage 0 */

      // initiator creates payload
      const initSignedPayload = await libp2pInitKeys.sign(getHandshakePayload(kpInitiator.publicKey))
      libp2pInitKeys.marshal().slice(0, 32)
      const libp2pInitPubKey = libp2pInitKeys.marshal().slice(32, 64)
      const payloadInitEnc = await createHandshakePayload(libp2pInitPubKey, initSignedPayload)

      // initiator sends message
      const message = Buffer.concat([Buffer.alloc(0), payloadInitEnc])
      const messageBuffer = ikI.sendMessage(initiatorSession, message)

      expect(messageBuffer.ne.length).not.equal(0)

      // responder receives message
      ikR.recvMessage(responderSession, messageBuffer)

      /* Stage 1 */

      // responder creates payload
      libp2pRespKeys.marshal().slice(0, 32)
      const libp2pRespPubKey = libp2pRespKeys.marshal().slice(32, 64)
      const respSignedPayload = await libp2pRespKeys.sign(getHandshakePayload(kpResponder.publicKey))
      const payloadRespEnc = await createHandshakePayload(libp2pRespPubKey, respSignedPayload)

      const message1 = Buffer.concat([message, payloadRespEnc])
      const messageBuffer2 = ikR.sendMessage(responderSession, message1)

      // initiator receives message
      ikI.recvMessage(initiatorSession, messageBuffer2)

      if (initiatorSession?.cs1?.k != null) {
        assert(uint8ArrayEquals(initiatorSession.cs1.k, responderSession?.cs1?.k ?? new Uint8Array()))
      }

      if (initiatorSession?.cs2?.k != null) {
        assert(uint8ArrayEquals(initiatorSession.cs2.k, responderSession?.cs2?.k ?? new Uint8Array()))
      }
    } catch (e) {
      const err = e as Error
      return assert(false, err.message)
    }
  })
})
