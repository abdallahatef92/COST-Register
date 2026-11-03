'use strict';
// A source file is a path (Node) or { name, data: ArrayBuffer | Uint8Array } (browser). The browser page provides XLSX globally.
const XLSX = (typeof globalThis !== 'undefined' && globalThis.XLSX) || require('xlsx');
const readBook = (src, o = {}) => (typeof src === 'string' ? XLSX.readFile(src, o) : XLSX.read(src.data, { type: 'array', ...o }));
const baseName = (src) => (!src ? '' : typeof src === 'string' ? src.replace(/^.*[\\/]/, '') : src.name || '');
module.exports = { XLSX, readBook, baseName };
