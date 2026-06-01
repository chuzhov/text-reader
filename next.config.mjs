import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };
    if (!isServer) {
      const src = path.join(__dirname, 'node_modules/pdfjs-dist/build/pdf.worker.min.js');
      const dest = path.join(__dirname, 'public/pdf.worker.min.js');
      fs.copyFileSync(src, dest);
    }
    return config;
  },
};

export default nextConfig;
