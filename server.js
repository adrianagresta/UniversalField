import http from 'http'
import fs from 'fs'
import path from 'path'

const server = http.createServer((req, res) => {
    const filePath = '.' + (req.url === '/' ? '/index.html' : req.url)
    const ext = path.extname(filePath)

    const mime = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css'
    }[ext] || 'text/plain'

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404)
            res.end('Not found')
            return
        }
        res.writeHead(200, { 'Content-Type': mime })
        res.end(data)
    })
})

server.listen(3003, () => console.log('Server running on http://localhost:3003'))
