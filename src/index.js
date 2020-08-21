/*
    Developed / Developing by Cosmostation
    [WARNING] CosmosJS is under ACTIVE DEVELOPMENT and should be treated as alpha version. We will remove this warning when we have a release that is stable, secure, and propoerly tested.
*/

'use strict'

global.fetch || (global.fetch = require('node-fetch').default);
const bip39 = require('bip39');
const bip32 = require('bip32');
const bech32 = require('bech32');
const secp256k1 = require('secp256k1');
const sovrin = require('sovrin-did');
const crypto = require('crypto');
const bitcoinjs = require('bitcoinjs-lib');
const base58 = require('bs58');

let Cosmos = function(url, chainId) {
	this.url = url;
	this.chainId = chainId;
	this.path = "m/44'/118'/0'/0/0";
	this.bech32MainPrefix = "cosmos";

	if (!this.url) {
		throw new Error("url object was not set or invalid")
	}
	if (!this.chainId) {
		throw new Error("chainId object was not set or invalid")
	}
}

function network(url, chainId) {
	return new Cosmos(url, chainId);
}

function convertStringToBytes(str) {
	if (typeof str !== "string") {
		throw new Error("str expects a string")
	}
	var myBuffer = [];
	var buffer = Buffer.from(str, 'utf8');
	for (var i = 0; i < buffer.length; i++) {
		myBuffer.push(buffer[i]);
	}
	return myBuffer;
}

function getPubKeyBase64(ixoDid) {
	return base58.decode(ixoDid.verifyKey).toString('base64');
}

function sortObject(obj) {
	if (obj === null) return null;
	if (typeof obj !== "object") return obj;
	if (Array.isArray(obj)) return obj.map(sortObject);
	const sortedKeys = Object.keys(obj).sort();
	const result = {};
	sortedKeys.forEach(key => {
		result[key] = sortObject(obj[key])
	});
	return result;
}

Cosmos.prototype.setBech32MainPrefix = function(bech32MainPrefix) {
	this.bech32MainPrefix = bech32MainPrefix;

	if (!this.bech32MainPrefix) {
		throw new Error("bech32MainPrefix object was not set or invalid")
	}
}

Cosmos.prototype.setPath = function(path) {
	this.path = path;

	if (!this.path) {
		throw new Error("path object was not set or invalid")
	}
}

Cosmos.prototype.getAccounts = function(address) {
	let accountsApi = "";
	if (this.chainId.indexOf("irishub") != -1) {
		accountsApi = "/bank/accounts/";
	} else {
		accountsApi = "/auth/accounts/";
	}
	return fetch(this.url + accountsApi + address)
		.then(response => response.json())
}

Cosmos.prototype.getAddress = function(mnemonic, checkSum = true) {
	if (typeof mnemonic !== "string") {
		throw new Error("mnemonic expects a string")
	}
	if (checkSum) {
		if (!bip39.validateMnemonic(mnemonic)) throw new Error("mnemonic phrases have invalid checksums");
	}
	const ixoDid = Cosmos.prototype.getIxoDid(mnemonic)
	const verifyKey = crypto.createHash('sha256').update(base58.decode(ixoDid.verifyKey)).digest('bytes').slice(0, 20)
	return bech32.encode(this.bech32MainPrefix, bech32.toWords(verifyKey));
}

Cosmos.prototype.getIxoDid = function(mnemonic) {
	if (typeof mnemonic !== "string") {
		throw new Error("mnemonic expects a string")
	}
	const seed = crypto.createHash('sha256').update(mnemonic).digest("hex");
	const didSeed = new Uint8Array(32);
	for (let i = 0; i < 32; ++i) {
		didSeed[i] = parseInt(seed.substring(i * 2, i * 2 + 2), 16)
	}
	return sovrin.fromSeed(didSeed);
}

Cosmos.prototype.newStdMsg = function(input) {
	const stdSignMsg = new Object;
	stdSignMsg.json = input;

	stdSignMsg.bytes = convertStringToBytes(JSON.stringify(sortObject(stdSignMsg.json)));
	return stdSignMsg;
}

Cosmos.prototype.sign = function(stdSignMsg, ixoDid, modeType = "sync") {
	// The supported return types includes "block"(return after tx commit), "sync"(return after CheckTx) and "async"(return right away).
	let signMessage = stdSignMsg.json;
	let signObj = sovrin.signMessage(JSON.stringify(sortObject(signMessage)), ixoDid.secret.signKey, ixoDid.verifyKey);
	var signatureBase64 = Buffer.from(signObj, 'binary').slice(0, 64).toString('base64');
	return {
		"tx": {
			"msg": stdSignMsg.json.msgs,
			"fee": stdSignMsg.json.fee,
			"signatures": [
				{
					"account_number": stdSignMsg.json.account_number,
					"sequence": stdSignMsg.json.sequence,
					"signature": signatureBase64,
					"pub_key": {
						"type": "tendermint/PubKeyEd25519",
						"value": getPubKeyBase64(ixoDid)
					}
				}
			],
			"memo": stdSignMsg.json.memo
		},
		"mode": modeType
	}
}

Cosmos.prototype.broadcast = function(signedTx) {
	let broadcastApi = "";
	if (this.chainId.indexOf("irishub") != -1) {
		broadcastApi = "/tx/broadcast";
	} else {
		broadcastApi = "/txs";
	}

	return fetch(this.url + broadcastApi, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(signedTx)
	})
		.then(response => response.json())
}

module.exports = {
	network: network
}
