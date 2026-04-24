// ============================================================
// ONEDRIVE.JS - Subida directa a OneDrive via Microsoft Graph API
// Sin Power Automate Premium. Solo requiere registro de app en Azure AD
// (incluido gratuitamente en cualquier suscripción Microsoft 365)
// ============================================================
(function () {
    'use strict';

    function getCfg() {
        return {
            tenantId:     localStorage.getItem('ms-tenant-id')     || '',
            clientId:     localStorage.getItem('ms-client-id')     || '',
            clientSecret: localStorage.getItem('ms-client-secret') || '',
            driveUser:    localStorage.getItem('ms-drive-user')    || ''
        };
    }

    function isConfigured() {
        var c = getCfg();
        return !!(c.tenantId && c.clientId && c.clientSecret && c.driveUser);
    }

    async function getToken(cfg) {
        var resp = await fetch(
            'https://login.microsoftonline.com/' + cfg.tenantId + '/oauth2/v2.0/token',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type:    'client_credentials',
                    client_id:     cfg.clientId,
                    client_secret: cfg.clientSecret,
                    scope:         'https://graph.microsoft.com/.default'
                })
            }
        );
        if (!resp.ok) {
            var err = await resp.json().catch(() => ({}));
            throw new Error('Token error: ' + (err.error_description || resp.status));
        }
        var data = await resp.json();
        return data.access_token;
    }

    window.subirAOneDrive = async function (buffer, fileName) {
        if (!isConfigured()) {
            if (window.showToast) showToast('⚙️ Configura OneDrive en Configuración antes de subir', 'error');
            return false;
        }
        var cfg = getCfg();
        try {
            var token = await getToken(cfg);
            var uploadUrl = 'https://graph.microsoft.com/v1.0/users/'
                + encodeURIComponent(cfg.driveUser)
                + '/drive/root:/Visitas%20T%C3%A9cnicas%20Solar/'
                + encodeURIComponent(fileName)
                + ':/content';

            var uploadResp = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                },
                body: buffer
            });

            if (uploadResp.ok || uploadResp.status === 201) {
                if (window.showToast) showToast('✅ Subido a OneDrive — carpeta: Visitas Técnicas Solar', 'success');
                actualizarEstadoUI(true);
                return true;
            }
            var errBody = await uploadResp.json().catch(() => ({}));
            throw new Error(errBody.error?.message || 'HTTP ' + uploadResp.status);
        } catch (e) {
            console.error('OneDrive upload error:', e);
            var msg = 'Error al subir a OneDrive';
            if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
                msg = 'Sin conexión. Verifica tu red e intenta de nuevo.';
            } else if (e.message) {
                msg = e.message;
            }
            if (window.showToast) showToast(msg, 'error');
            return false;
        }
    };

    window.estadoOneDrive = function () {
        return { configurado: isConfigured() };
    };

    function actualizarEstadoUI(ok) {
        var el = document.getElementById('onedrive-status');
        if (!el) return;
        if (!isConfigured()) {
            el.innerHTML = '⚠️ Sin configurar — sigue los pasos abajo para activarlo';
            el.style.color = '#F9A825';
        } else if (ok) {
            el.innerHTML = '✅ Conectado — archivos van a OneDrive de ' + (getCfg().driveUser || '');
            el.style.color = '#2E7D32';
        } else {
            el.innerHTML = '🔵 Configurado — listo para subir a OneDrive';
            el.style.color = '#0078D4';
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        var cfg = getCfg();
        var fields = ['ms-tenant-id','ms-client-id','ms-client-secret','ms-drive-user'];
        fields.forEach(function(key) {
            var el = document.getElementById('config-' + key);
            if (el) el.value = localStorage.getItem(key) || '';
        });

        var btnGuardar = document.getElementById('btn-guardar-onedrive');
        if (btnGuardar) {
            btnGuardar.addEventListener('click', function () {
                var allFilled = true;
                fields.forEach(function(key) {
                    var el = document.getElementById('config-' + key);
                    if (el) {
                        var val = el.value.trim();
                        localStorage.setItem(key, val);
                        if (!val) allFilled = false;
                    }
                });
                actualizarEstadoUI(false);
                if (window.showToast) showToast(
                    allFilled ? '✅ Configuración guardada. OneDrive listo.' : '⚠️ Faltan campos por completar',
                    allFilled ? 'success' : 'error'
                );
            });
        }

        setTimeout(actualizarEstadoUI, 300);
    });
})();
