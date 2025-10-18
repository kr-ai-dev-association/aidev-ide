import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    build: {
        outDir: '../dist/webview-react',
        rollupOptions: {
            output: {
                entryFileNames: 'chat-react.js',
                chunkFileNames: 'chat-react-[hash].js',
                assetFileNames: 'chat-react-[hash].[ext]'
            }
        }
    },
    server: {
        port: 3000
    }
})
