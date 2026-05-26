// ============================================================
// ONEDRIVE.JS - Subida a OneDrive via Proxy Backend
// Los técnicos solo dan click en "exportar" y se sube automático.
// Las credenciales de Microsoft están en Firestore (solo admin).
// El proxy backend maneja la autenticación con Microsoft.
// ============================================================
(function () {
    'use strict';

    // ── URL del proxy backend ────────────────────────────────────
    // Cambiar esta URL cuando se despliegue el proxy en producción
    var PROXY_URL = localStorage.getItem('onedrive-proxy-url') || 'https://visita-solar-proxy.onrender.com';

    // ── Verificar si OneDrive está configurado ───────────────────
    var oneDriveConfigurado = false;

    async function verificarConfiguracion() {
        try {
            var resp = await fetch(PROXY_URL + '/api/onedrive-status');
            if (resp.ok) {
                var data = await resp.json();
                oneDriveConfigurado = data.configured;
                actualizarEstadoUI(data);
                return data.configured;
            }
        } catch (e) {
            console.log('Proxy no disponible:', e.message);
            oneDriveConfigurado = false;
            actualizarEstadoUI({ configured: false, error: 'Proxy no disponible' });
        }
        return false;
    }

    // ── Subir archivo a OneDrive (via proxy) ─────────────────────
    window.subirAOneDrive = async function (buffer, fileName) {
        if (!oneDriveConfigurado) {
            // Intentar verificar una vez más
            var ok = await verificarConfiguracion();
            if (!ok) {
                if (window.showToast) showToast('⚙️ OneDrive no está configurado. Pide al admin que lo configure.', 'error');
                return false;
            }
        }

        try {
            if (window.showToast) showToast('☁️ Subiendo a OneDrive...', 'info');

            // Convertir ArrayBuffer/Uint8Array a base64
            var base64Data;
            if (buffer instanceof ArrayBuffer) {
                base64Data = arrayBufferToBase64(buffer);
            } else if (buffer instanceof Uint8Array) {
                base64Data = uint8ArrayToBase64(buffer);
            } else if (typeof buffer === 'string') {
                base64Data = buffer; // Ya es base64
            } else {
                // Intentar como ArrayBuffer
                base64Data = arrayBufferToBase64(buffer);
            }

            var resp = await fetch(PROXY_URL + '/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: fileName,
                    fileData: base64Data,
                    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                })
            });

            var data = await resp.json();

            if (resp.ok && data.success) {
                console.log('✅ Subido a OneDrive:', data.file?.name, data.file?.size, 'bytes');
                if (window.showToast) showToast('✅ Subido a OneDrive — carpeta: Visitas Técnicas Solar', 'success');
                return true;
            }

            // Error del proxy
            throw new Error(data.error || 'Error desconocido del servidor');

        } catch (e) {
            console.error('OneDrive upload error:', e);
            var msg = '❌ Error al subir a OneDrive';
            if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
                msg = '📡 Sin conexión al servidor. Verifica tu internet.';
            } else if (e.message.includes('Token expirado')) {
                msg = '🔄 Sesión expirada, intenta de nuevo.';
            } else if (e.message) {
                msg = '❌ ' + e.message;
            }
            if (window.showToast) showToast(msg, 'error');
            return false;
        }
    };

    // ── Guardar configuración (solo admin) ───────────────────────
    window.guardarConfigOneDrive = async function (tenantId, clientId, clientSecret, driveUser) {
        // Obtener token del admin logueado
        var user = firebase.auth().currentUser;
        if (!user) {
            if (window.showToast) showToast('❌ Debes estar logueado como admin', 'error');
            return false;
        }

        try {
            var idToken = await user.getIdToken();

            var resp = await fetch(PROXY_URL + '/api/onedrive-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: tenantId,
                    clientId: clientId,
                    clientSecret: clientSecret,
                    driveUser: driveUser,
                    adminToken: idToken
                })
            });

            var data = await resp.json();

            if (resp.ok && data.success) {
                oneDriveConfigurado = true;
                if (window.showToast) showToast('✅ Configuración de OneDrive guardada', 'success');
                actualizarEstadoUI({ configured: true, driveUser: driveUser });
                return true;
            }

            throw new Error(data.error || 'Error al guardar');

        } catch (e) {
            console.error('Error guardando config:', e);
            if (window.showToast) showToast('❌ ' + e.message, 'error');
            return false;
        }
    };

    window.estadoOneDrive = function () {
        return { configurado: oneDriveConfigurado };
    };

    // ── Helpers base64 ───────────────────────────────────────────
    function arrayBufferToBase64(buffer) {
        var binary = '';
        var bytes = new Uint8Array(buffer);
        for (var i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    function uint8ArrayToBase64(uint8) {
        var binary = '';
        for (var i = 0; i < uint8.length; i++) {
            binary += String.fromCharCode(uint8[i]);
        }
        return btoa(binary);
    }

    // ── UI del estado ────────────────────────────────────────────
    function actualizarEstadoUI(data) {
        var el = document.getElementById('onedrive-status');
        if (!el) return;

        if (!data || !data.configured) {
            var errorMsg = data?.error || 'No configurado';
            if (errorMsg.includes('Proxy')) {
                el.innerHTML = '⚠️ Servidor proxy no disponible. Contacta al administrador.';
            } else {
                el.innerHTML = '⚠️ OneDrive no configurado. El administrador debe completar la configuración.';
            }
            el.style.color = '#F9A825';
        } else {
            el.innerHTML = '✅ OneDrive activo — archivos van a: <strong>' + (data.driveUser || 'cuenta configurada') + '</strong>';
            el.style.color = '#2E7D32';
        }
    }

    // ── Inicialización del formulario de config (solo admin) ─────
    document.addEventListener('DOMContentLoaded', function () {
        // Guardar URL del proxy si hay campo
        var proxyUrlEl = document.getElementById('config-proxy-url');
        if (proxyUrlEl) {
            proxyUrlEl.value = PROXY_URL;
        }

        var btnGuardar = document.getElementById('btn-guardar-onedrive');
        if (btnGuardar) {
            btnGuardar.addEventListener('click', function () {
                var tenantId = (document.getElementById('config-ms-tenant-id')?.value || '').trim();
                var clientId = (document.getElementById('config-ms-client-id')?.value || '').trim();
                var clientSecret = (document.getElementById('config-ms-client-secret')?.value || '').trim();
                var driveUser = (document.getElementById('config-ms-drive-user')?.value || '').trim();

                // Guardar URL del proxy en localStorage
                var proxyInput = document.getElementById('config-proxy-url');
                if (proxyInput && proxyInput.value.trim()) {
                    PROXY_URL = proxyInput.value.trim();
                    localStorage.setItem('onedrive-proxy-url', PROXY_URL);
                }

                if (!tenantId || !clientId || !clientSecret || !driveUser) {
                    if (window.showToast) showToast('⚠️ Completa todos los campos', 'error');
                    return;
                }

                window.guardarConfigOneDrive(tenantId, clientId, clientSecret, driveUser);
            });
        }

        // Verificar estado al cargar
        setTimeout(verificarConfiguracion, 1000);
    });
})();
