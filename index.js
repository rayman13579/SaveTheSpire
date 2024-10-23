const express = require('express');
const fs = require('fs');
const decompress = require('decompress');
const app = express();
const httpPort = 2929;
const http = require('http');
const multer = require('multer');
require('dotenv').config();

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, __dirname + '/files');
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname)
    }
})
const upload = multer({ storage: storage, preservePath: true });

http.createServer(app).listen(httpPort, () => console.log('Listening for HTTP on %s...', httpPort));

app.put('/upload', upload.single('zip'), (req, res) => {
    console.log(req.file);
    const path = __dirname + '/files/' + req.file.filename;
    decompress(path, __dirname + '/files')
        .then(files => decodeSaveFiles(files))
        .catch(err => console.error(err));
    res.sendStatus(204);
});

let decodeSaveFiles = (files) => {
    files
        .filter(file => file.path.startsWith('saves/'))
        .forEach(decodeSave);
}

let decodeSave = (file) => {
    let encoded = file.data.toString('utf8');
    if (encoded.startsWith('{')) return;

    let saveBytes = Buffer.from(encoded, 'base64');
    let keyBytes = new TextEncoder().encode("key");

    let decodedBytes = [];
    for (let i = 0; i < saveBytes.length; i++) {
        decodedBytes.push(saveBytes[i] ^ keyBytes[i % keyBytes.length]);
    }
    let decoded = String.fromCharCode(...decodedBytes);
    fs.writeFileSync(__dirname + '/files/' + file.path, decoded);
}
