const express = require('express');
const fs = require('fs');
const decompress = require('decompress');
const dateformat = require('dateformat');
const app = express();
const httpPort = 2929;
const http = require('http');
const multer = require('multer');
const simpleGit = require('simple-git');

let logDateFormat = 'yyyy.mm.dd HH:MM:ss';

let pcDateFormat = 'yyyymmddHHMMss';

let androidDateFormat = 'mm/dd/yyyy HH:MM:ss';

const git = simpleGit({ baseDir: __dirname + '/files' });

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, __dirname);
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '.zip')
    }
})
const upload = multer({ storage: storage, preservePath: true });

http.createServer(app).listen(httpPort, () => console.log('Listening for HTTP on %s...', httpPort));

app.put('/upload', upload.single('saveTheSpire'), async (req, res) => {
    let userAgent = req.headers['user-agent'];
    console.log(dateformat(new Date(), logDateFormat) + ' | ' + userAgent + ' | uploading save');
    clearDirectory(userAgent);
    await unzip(req.file.filename, userAgent)
    backupSave(userAgent);
    res.send(204);
});

let clearDirectory = userAgent => {
    fs.rm(__dirname + '/files/preferences', { recursive: true, force: true }, () => { });
    fs.rm(__dirname + '/files/runs', { recursive: true, force: true }, () => { });
    fs.rm(__dirname + '/files/saves', { recursive: true, force: true }, () => { });
    console.log(dateformat(new Date(), logDateFormat) + ' | ' + userAgent + ' | directory cleared');
}

let unzip = async (filename, userAgent) => {
    await decompress(__dirname + "/" + filename, __dirname + '/files')
        .then(files => {
            convertFiles(files);
            console.log(dateformat(new Date(), logDateFormat) + ' | ' + userAgent + ' | unzipped save');
        })
        .catch(err => {
            console.log(dateformat(new Date(), logDateFormat) + ' | ' + userAgent + ' | ' + err);
        });
}

let backupSave = userAgent => {
    git
        .add('*')
        .commit(dateformat(new Date(), logDateFormat) + ' ' + userAgent)
        .push('origin', 'master');
    console.log(dateformat(new Date(), logDateFormat) + ' | ' + userAgent + ' | pushed to git');
}

let convertFiles = (files) => {
    for (let file of files) {
        if (file.path.startsWith('saves/')) {
            decodeSave(file);
        }
        /*     if (file.path.startsWith('runs/')) {
                 formatDateTime(file);
             } */
    }
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

let formatDateTime = (file) => {
    let run = JSON.parse(file.data.toString('utf8'));
    run.local_time = dateformat(run.local_time, pcDateFormat);
    fs.writeFileSync(__dirname + '/files/' + file.path, JSON.stringify(run));
}
