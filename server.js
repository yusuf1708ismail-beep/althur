const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// زانیارییە نهێنییەکان (تەنها لەسەر سێرڤەر دەنوسرێن)
// ============================================
const ADMIN_USER = process.env.ADMIN_USER || 'eso';
const ADMIN_PASS = process.env.ADMIN_PASS || 'eso2020eso2020';
const BIN_ID = process.env.BIN_ID || '69ac7141ae596e708f6a2f5f';
const API_KEY = process.env.API_KEY || '$2a$10$egHvuL0PcRFYPV5N1s0JUeNl3nk7iJxTbVIRCsU6c7OYB8zwiWceK';

// توکی بەڕێوەبردنی سێشن
const ADMIN_TOKEN = 'admin-secret-token-12345';

// --------------------------------------------
// خوێندنەوە و توماسکردن لە JSONBin
// --------------------------------------------
async function loadUsersFromJSONBin() {
    try {
        const response = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
            headers: { 'X-Master-Key': API_KEY }
        });
        if (!response.ok) return { users: [] };
        const data = await response.json();
        return data.record || { users: [] };
    } catch (error) {
        console.error('Error loading JSONBin:', error);
        return { users: [] };
    }
}

async function saveUsersToJSONBin(users) {
    try {
        await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': API_KEY
            },
            body: JSON.stringify({ users: users })
        });
        return true;
    } catch (error) {
        console.error('Error saving JSONBin:', error);
        return false;
    }
}

// ============================================
// API Endpoints
// ============================================

// 1. چوونەژوورەوەی بەکارهێنەران
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const data = await loadUsersFromJSONBin();
    const users = data.users || [];

    const user = users.find(u => u.email === email && u.password === password);

    if (!user) {
        return res.status(401).json({ success: false, message: 'ئیمەیڵ یان وشەی نهێنی هەڵەیە' });
    }

    if (!user.verified && user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'ئەکاونتەکەت کۆنفێرم نەکراوە! تکایە پەیوەندی بە ئەدمینەوە بکە' });
    }

    res.json({ success: true, user });
});

// 2. خۆتۆمارکردنی بەکارهێنەران
app.post('/api/signup', async (req, res) => {
    const { name, email, password, platform } = req.body;
    const data = await loadUsersFromJSONBin();
    let users = data.users || [];

    if (users.some(u => u.email === email)) {
        return res.status(400).json({ success: false, message: 'ئەم ئیمەیڵە پێشتر تۆمارکراوە' });
    }

    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const newUser = {
        id: 'user_' + Date.now(),
        name,
        email,
        password,
        platform,
        joinedDate: new Date().toLocaleDateString('ku'),
        downloads: 0,
        level: 1,
        role: 'user',
        verified: false,
        token
    };

    users.push(newUser);
    const saved = await saveUsersToJSONBin(users);

    if (saved) {
        res.json({ success: true, message: 'ئەکاونت دروستکرا' });
    } else {
        res.status(500).json({ success: false, message: 'هەڵە لە دروستکردنی ئەکاونت' });
    }
});

// 3. کۆنفێرمکردنی ئیمەیڵ (لە ڕێگەی لینک)
app.post('/api/verify', async (req, res) => {
    const { userId, token } = req.body;
    const data = await loadUsersFromJSONBin();
    let users = data.users || [];

    const index = users.findIndex(u => u.id === userId && u.token === token);
    if (index !== -1) {
        users[index].verified = true;
        delete users[index].token;
        await saveUsersToJSONBin(users);
        return res.json({ success: true });
    }
    res.status(400).json({ success: false, message: 'تۆکن هەڵەیە' });
});

// 4. چوونەژوورەوەی ئەدمین
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        return res.json({
            success: true,
            message: 'بەخێربێیت بەڕێوەبەر',
            adminName: username,
            token: ADMIN_TOKEN
        });
    }
    res.status(401).json({ success: false, message: 'ناوی بەکارهێنەر یان وشەی نهێنی هەڵەیە' });
});

// 5. هێنانی بەکارهێنەران بۆ داشبۆردی ئەدمین
app.get('/api/admin/users', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${ADMIN_TOKEN}`) {
        return res.status(403).json({ success: false, message: 'دەسەڵاتت نییە' });
    }

    const data = await loadUsersFromJSONBin();
    res.json({ success: true, users: data.users || [] });
});

// 6. کۆنفێرمکردنی بەکارهێنەر بە دەستی لەلایەن ئەدمینەوە
app.post('/api/admin/verify-user', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${ADMIN_TOKEN}`) {
        return res.status(403).json({ success: false, message: 'دەسەڵاتت نییە' });
    }

    const { userId } = req.body;
    const data = await loadUsersFromJSONBin();
    let users = data.users || [];

    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
        users[userIndex].verified = true;
        delete users[userIndex].token;
        await saveUsersToJSONBin(users);
        return res.json({ success: true });
    }
    res.status(404).json({ success: false, message: 'بەکارهێنەر نەدۆزرایەوە' });
});

// 7. سڕینەوەی بەکارهێنەر لەلایەن ئەدمینەوە
app.post('/api/admin/delete-user', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${ADMIN_TOKEN}`) {
        return res.status(403).json({ success: false, message: 'دەسەڵاتت نییە' });
    }

    const { userId } = req.body;
    const data = await loadUsersFromJSONBin();
    let users = data.users || [];

    users = users.filter(u => u.id !== userId);
    await saveUsersToJSONBin(users);
    res.json({ success: true });
});

// دەستپێکردنی سێرڤەر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});