
// relative path if `lib/` cloned elsewhere
// const { PortalClient } = require('../../lib/rest/clients/ts');

// if it becomes as SDK
// const { PortalClient } = require('portal-sdk');

const config = require('../config/config');

class PortalService {
    constructor() {
        //ws endpoint (rest/ server must be running)
        // this.wsUrl = `${config.portal.serverUrl.replace(/^http/, 'ws')}/ws`;
        // this.client = new PortalClient({ serverUrl: this.wsUrl });
    }

    async init() {
        // lazy-connect
        if (!this.client.isConnected()) {
            await this.client.connect(config.portal.authToken);
        }
    }

    /** 
     *kickoff a key Nostr handshake: returns { url, stream_id }
     */
    async getHandshakeUrl() {
        await this.init();
        return this.client.getKeyHandshakeUrl();
    }

    /**
     * finalize portal login: pass in main_key & subkeys from wallet
     * returns authenticated info, e.g. { public_key, relays, … }
     */
    async authenticateKey({ main_key, subkeys }) {
        await this.init();
        return this.client.authenticateKey({ main_key, subkeys });
    }
}

module.exports = new PortalService();
