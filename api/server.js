// ============================================================
// SERVER.JS - Proxy Backend para subida a OneDrive
// Visita Técnica Solar - Solix SAS / Ecowatt E.S.P
// ============================================================
// Este servidor actúa como intermediario entre la PWA y Microsoft
// Graph API. Resuelve el problema de CORS al obtener tokens
// con client_credentials desde el servidor.
//
// USO LOCAL: node server.js
// DEPLOY: Compatible con Render.com, Railway, Heroku, Azure App Service
// ============================================================

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3002;

// ── Firebase Admin SDK ───────────────────────────────────────
// Inicializar con las credenciales del proyecto solix-visitas
// En producción usar GOOGLE_APPLICATION_CREDENTIALS o variable de entorno
admin.initializeApp({
    projectId: 'solix-visitas'
});
const db = admin.firestore();

// ── Middleware ───────────────────────────────────────────────
app.use(cors({
    origin: [
        'https://rafael-henao.github.io',
        'http://localhost:3000',
        'http://localhost:8080',
        'http://127.0.0.1:5500'
    ]
}));
app.use(express.json({ limit: '50mb' }));

// ── Obtener configuración de OneDrive desde Firestore ────────
async function getOneDriveConfig() {
    const doc = await db.collection('config').doc('onedrive').get();
    if (!doc.exists) {
        throw new Error('Configuración de OneDrive no encontrada en Firestore');
    }
    const data = doc.data();
    if (!data.tenantId || !data.clientId || !data.clientSecret || !data.driveUser) {
        throw new Error('Configuración incompleta. El admin debe configurar todos los campos.');
    }
    return data;
}

// ── Obtener token de Microsoft Graph ─────────────────────────
async function getMicrosoftToken(config) {
    const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: 'https://graph.microsoft.com/.default'
    });

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error('Token error:', err);
        throw new Error('Error al obtener token: ' + (err.error_description || response.status));
    }

    const data = await response.json();
    return data.access_token;
}

// ── Cache de token (válido ~1 hora) ──────────────────────────
let tokenCache = { token: null, expiresAt: 0 };

async function getTokenCached(config) {
    const now = Date.now();
    if (tokenCache.token && tokenCache.expiresAt > now) {
        return tokenCache.token;
    }
    const token = await getMicrosoftToken(config);
    // Token dura 3599 segundos, renovar 5 min antes
    tokenCache = { token, expiresAt: now + (55 * 60 * 1000) };
    return token;
}

// ── Endpoint: Subir archivo a OneDrive ───────────────────────
app.post('/api/upload', async (req, res) => {
    try {
        const { fileName, fileData, mimeType } = req.body;

        if (!fileName || !fileData) {
            return res.status(400).json({ error: 'Faltan fileName o fileData' });
        }

        console.log(`[${new Date().toLocaleTimeString()}] Subiendo: ${fileName}`);

        // Obtener config de Firestore
        const config = await getOneDriveConfig();

        // Obtener token
        const token = await getTokenCached(config);

        // Convertir base64 a buffer
        const buffer = Buffer.from(fileData, 'base64');

        // Subir a OneDrive del usuario configurado
        const uploadUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.driveUser)}/drive/root:/Visitas%20T%C3%A9cnicas%20Solar/${encodeURIComponent(fileName)}:/content`;

        const uploadResp = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            },
            body: buffer
        });

        if (uploadResp.ok || uploadResp.status === 201) {
            const data = await uploadResp.json();
            console.log(`  ✅ Subido: ${data.name} (${data.size} bytes)`);
            return res.json({
                success: true,
                message: 'Archivo subido exitosamente',
                file: {
                    name: data.name,
                    size: data.size,
                    webUrl: data.webUrl
                }
            });
        }

        // Error de Microsoft Graph
        const errBody = await uploadResp.json().catch(() => ({}));
        console.error('  ❌ Graph error:', uploadResp.status, errBody.error?.message);

        if (uploadResp.status === 401) {
            // Token expirado, limpiar cache e intentar de nuevo
            tokenCache = { token: null, expiresAt: 0 };
            return res.status(401).json({ error: 'Token expirado. Intenta de nuevo.' });
        }

        return res.status(uploadResp.status).json({
            error: errBody.error?.message || 'Error al subir archivo',
            code: errBody.error?.code
        });

    } catch (error) {
        console.error('Error en /api/upload:', error.message);
        return res.status(500).json({ error: error.message });
    }
});

// ── Endpoint: Verificar estado de configuración ──────────────
app.get('/api/onedrive-status', async (req, res) => {
    try {
        const config = await getOneDriveConfig();
        res.json({
            configured: true,
            driveUser: config.driveUser,
            tenantId: config.tenantId ? '***' + config.tenantId.slice(-4) : null
        });
    } catch (e) {
        res.json({ configured: false, error: e.message });
    }
});

// ── Endpoint: Guardar configuración (solo desde admin) ───────
app.post('/api/onedrive-config', async (req, res) => {
    try {
        const { tenantId, clientId, clientSecret, driveUser, adminToken } = req.body;

        if (!tenantId || !clientId || !clientSecret || !driveUser) {
            return res.status(400).json({ error: 'Todos los campos son requeridos' });
        }

        // Verificar que quien envía es admin (validar Firebase token)
        if (!adminToken) {
            return res.status(401).json({ error: 'Se requiere autenticación de admin' });
        }

        try {
            const decoded = await admin.auth().verifyIdToken(adminToken);
            // Verificar rol admin en Firestore
            const userDoc = await db.collection('users').doc(decoded.uid).get();
            if (!userDoc.exists || userDoc.data().role !== 'admin') {
                return res.status(403).json({ error: 'Solo administradores pueden configurar OneDrive' });
            }
        } catch (e) {
            return res.status(401).json({ error: 'Token de admin inválido' });
        }

        // Guardar configuración en Firestore
        await db.collection('config').doc('onedrive').set({
            tenantId,
            clientId,
            clientSecret,
            driveUser,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Limpiar cache de token (por si cambiaron credenciales)
        tokenCache = { token: null, expiresAt: 0 };

        console.log(`  ✅ Config OneDrive actualizada por admin. DriveUser: ${driveUser}`);
        res.json({ success: true, message: 'Configuración guardada' });

    } catch (error) {
        console.error('Error guardando config:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ── Health check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'onedrive-proxy',
        tokenCached: !!tokenCache.token
    });
});

// ── Iniciar ──────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log('');
    console.log('===========================================');
    console.log('  OneDrive Proxy - Visita Técnica Solar');
    console.log('===========================================');
    console.log(`  Puerto:    ${PORT}`);
    console.log(`  Upload:    POST /api/upload`);
    console.log(`  Config:    POST /api/onedrive-config`);
    console.log(`  Status:    GET  /api/onedrive-status`);
    console.log(`  Health:    GET  /api/health`);
    console.log('===========================================');
    console.log('');
});
