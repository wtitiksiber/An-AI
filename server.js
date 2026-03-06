const express = require('express');
const { exec } = require('child_process');
const path = require('path');

const app = express();
const port = 3000;

app.use(express.static(__dirname));

app.post('/start/:scriptName', (req, res) => {
    const { scriptName } = req.params;
    let scriptPath;
    let cwd;

    if (scriptName === 'main') {
        scriptPath = 'index.js';
        cwd = __dirname;
    } else if (scriptName === 'gemini') {
        scriptPath = 'index.js';
        cwd = path.join(__dirname, 'Gemini-discord-bot');
    } else {
        return res.status(400).send('Invalid script name');
    }

    exec(`node ${scriptPath}`, { cwd }, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return res.status(500).send(`Error starting ${scriptName} bot: ${stderr}`);
        }
        console.log(`stdout: ${stdout}`);
        res.send(`${scriptName} bot started successfully.`);
    });
});

app.listen(port, () => {
    console.log(`Admin portal running at http://localhost:${port}`);
});
