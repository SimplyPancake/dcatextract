import type { Peer } from 'crossws'

export const activePeers = new Map<string, Set<Peer>>()

export function registerPeer(sessionId: string, peer: Peer) {
    if (!activePeers.has(sessionId)) {
        activePeers.set(sessionId, new Set())
    }
    activePeers.get(sessionId)!.add(peer)
}

export function unregisterPeer(sessionId: string, peer: Peer) {
    const peers = activePeers.get(sessionId)
    if (peers) {
        peers.delete(peer)
        if (peers.size === 0) {
            activePeers.delete(sessionId)
        }
    }
}

export function notifySession(sessionId: string, message: any) {
    const peers = activePeers.get(sessionId)
    if (peers) {
        const payload = JSON.stringify(message)
        for (const peer of peers) {
            peer.send(payload)
        }
    }
}
