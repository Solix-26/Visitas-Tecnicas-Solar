// ========================================================
// APP.JS - Visitas Técnicas para Paneles Solares
// ========================================================

(function () {
    'use strict';

    let currentStep = 1;
    let photos = [];
    let techoPhotos = [];
    let editingVisitaId = null;  // ID de la visita siendo editada (null = nueva)
    let firmaCtx, firmaCanvas, firmaDibujando = false;

    // Etiquetas legibles para el tipo de clima / piso térmico
    function climaLabel(v) {
        const map = {
            calido:   '☀️ Cálido (0–1000 m)',
            templado: '⛅ Templado (1000–2000 m)',
            frio:     '❄️ Frío (2000–3000 m)',
            paramo:   '🏔️ Páramo (>3000 m)'
        };
        return map[v] || v || '-';
    }

    function espacioMBLabel(v) {
        const map = {
            'ambos':'Sí — medidor bidireccional y baterías',
            'solo-medidor':'Solo para medidor bidireccional',
            'solo-baterias':'Solo para baterías',
            'ninguno':'No hay espacio suficiente',
            'requiere-adecuacion':'Requiere adecuación de espacio'
        };
        return map[v] || v || '-';
    }

    function accesoTechoLabel(v) {
        const map = {
            'escalera-extension':'Escalera de extensión',
            'escalera-tijera':'Escalera de tijera',
            'escalera-marina':'Escalera marina / fija',
            'escaleras-internas':'Escaleras internas',
            'acceso-directo':'Acceso directo (terraza)',
            'rampa':'Rampa',
            'requiere-andamio':'Requiere andamio / elevador',
            'sin-acceso':'Sin acceso seguro'
        };
        return map[v] || v || '-';
    }

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        setFechaHoraActual();
        initNavigation();
        initSteps();
        initGPS();
        initPhotos();
        initFirma();
        initActions();
        initConfig();
        registerServiceWorker();
        initTechoPhotos();
        initTransformadorPhotos();
        initReciboPhotos();
        initArea1Photos();
        initIrradiacionAuto();
        initBateriasToggle();
        initMotivoSelect();
        initTableroPhotos();
        initEquipoPhotos();
        initEspacioEquiposPhotos();
        initCondicionales();
        initRemoveAreaButtons();
    }

    // Mostrar/ocultar campos dependientes de un radio Sí/No
    function initCondicionales() {
        const reglas = [
            ['check-cert-carga', 'cert-carga-fecha-group'],
            ['check-espacio-equipos', 'espacio-equipos-foto-group'],
        ];
        reglas.forEach(function (r) {
            const grupo = document.getElementById(r[1]);
            if (!grupo) return;
            function sync() {
                const sel = document.querySelector('input[name="' + r[0] + '"]:checked');
                grupo.style.display = (sel && sel.value === 'si') ? '' : 'none';
            }
            document.querySelectorAll('input[name="' + r[0] + '"]').forEach(function (radio) {
                radio.addEventListener('change', sync);
            });
            sync();
        });
    }

    function initBateriasToggle() {
        // El selector de número de baterías queda siempre visible.
        const numGroup = document.getElementById('num-baterias-group');
        if (numGroup) numGroup.style.display = '';
    }

    function initMotivoSelect() {
        // Cada entrada: [id del select, id del grupo "otro", valores que disparan el campo]
        const configs = [
            ['motivo-select',      'motivo-otro-group',           ['otro']],
            ['tipo-techo',         'tipo-techo-otro-group',       ['otro']],
            ['tipo-obstaculos',    'tipo-obstaculos-otro-group',  ['otro', 'otros']],
            ['tipo-acceso-techo',  'tipo-acceso-techo-otro-group',['otro']],
        ];
        configs.forEach(function (cfg) {
            const sel = document.getElementById(cfg[0]);
            const otroGroup = document.getElementById(cfg[1]);
            const triggers = cfg[2];
            if (!sel || !otroGroup) return;
            function sync() {
                otroGroup.style.display = triggers.indexOf(sel.value) !== -1 ? '' : 'none';
            }
            sel.addEventListener('change', sync);
            sync(); // estado inicial (útil al cargar una visita en edición)
        });
    }

    function initRemoveAreaButtons() {
        // Wire up remove button on the static first area
        const container = document.getElementById('areas-container');
        if (!container) return;
        container.querySelectorAll('.btn-remove-area').forEach(btn => {
            btn.addEventListener('click', function () {
                const item = btn.closest('.area-item');
                if (item && container.querySelectorAll('.area-item').length > 1) {
                    container.removeChild(item);
                } else {
                    showToast('Debe haber al menos un área', 'error');
                }
            });
        });
    }
    
    // ========== IRRADIACIÓN SOLAR AUTOMÁTICA ==========
    function initIrradiacionAuto() {
        const btn = document.getElementById('btn-obtener-irradiacion');
        if (btn) {
            btn.addEventListener('click', obtenerIrradiacionSolar);
        }
    }
    
    async function obtenerIrradiacionSolar() {
        const status = document.getElementById('irradiacion-status');
        const gpsCoords = document.getElementById('gps-coords').value;
        
        if (!gpsCoords || gpsCoords === 'Error al obtener ubicación') {
            status.textContent = '⚠️ Primero obtén las coordenadas GPS en el Paso 1';
            status.style.color = '#f44336';
            return;
        }
        
        // Extraer latitud y longitud
        const match = gpsCoords.match(/([-\d.]+),\s*([-\d.]+)/);
        if (!match) {
            status.textContent = '⚠️ Formato de coordenadas inválido';
            status.style.color = '#f44336';
            return;
        }
        
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[2]);
        
        status.textContent = '⏳ Obteniendo datos de irradiación solar...';
        status.style.color = '#2196F3';
        
        try {
            // Usar NASA POWER API para datos de irradiación solar
            const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=ALLSKY_SFC_SW_DWN&community=RE&longitude=${lon}&latitude=${lat}&start=20230101&end=20231231&format=JSON`;
            
            const response = await fetch(url);
            if (!response.ok) throw new Error('Error en la API');
            
            const data = await response.json();
            const values = Object.values(data.properties.parameter.ALLSKY_SFC_SW_DWN);
            
            // Calcular promedio anual (excluyendo valores -999)
            const validValues = values.filter(v => v > 0);
            const promedio = validValues.reduce((a, b) => a + b, 0) / validValues.length;
            
            // La irradiancia de NASA está en kWh/m²/día
            const irradiancia = promedio.toFixed(2);
            // HSP es aproximadamente igual a la irradiancia en kWh/m²/día
            const hsp = promedio.toFixed(1);
            
            document.getElementById('irradiancia').value = irradiancia;
            document.getElementById('horas-solar-pico').value = hsp;
            
            status.innerHTML = `✅ Datos obtenidos: <strong>${irradiancia} kWh/m²/día</strong> (promedio anual NASA POWER)`;
            status.style.color = '#4CAF50';
            
            showToast('☀️ Irradiación solar obtenida automáticamente', 'success');
        } catch (error) {
            console.error('Error obteniendo irradiación:', error);
            // Usar estimación basada en latitud si falla la API
            const irradianciaEstimada = estimarIrradiancia(lat);
            
            document.getElementById('irradiancia').value = irradianciaEstimada.toFixed(2);
            document.getElementById('horas-solar-pico').value = irradianciaEstimada.toFixed(1);
            
            status.innerHTML = `⚡ Estimación basada en latitud: <strong>${irradianciaEstimada.toFixed(2)} kWh/m²/día</strong>`;
            status.style.color = '#FF9800';
            
            showToast('☀️ Irradiación estimada según latitud', 'success');
        }
    }
    
    function estimarIrradiancia(lat) {
        // Estimación simple basada en latitud (para Colombia/México aprox 4-6 kWh/m²/día)
        const absLat = Math.abs(lat);
        if (absLat < 10) return 5.5;
        if (absLat < 20) return 5.2;
        if (absLat < 30) return 4.8;
        if (absLat < 40) return 4.5;
        return 4.0;
    }
    
    // ========== FOTOS TABLERO PRINCIPAL ==========
    let tableroPhotos = [];
    function initTableroPhotos() {
        const camInput = document.getElementById('tablero-camera-input');
        const galInput = document.getElementById('tablero-gallery-input');
        const btnCam = document.getElementById('btn-tablero-camara');
        const btnGal = document.getElementById('btn-tablero-galeria');
        if (btnCam) btnCam.addEventListener('click', () => camInput.click());
        if (btnGal) btnGal.addEventListener('click', () => galInput.click());
        if (camInput) camInput.addEventListener('change', e => handleGenericPhotos(e, tableroPhotos, 5, renderTableroPhotos));
        if (galInput) galInput.addEventListener('change', e => handleGenericPhotos(e, tableroPhotos, 5, renderTableroPhotos));
    }
    function renderTableroPhotos() {
        const gallery = document.getElementById('tablero-gallery');
        if (!gallery) return;
        if (tableroPhotos.length === 0) {
            gallery.innerHTML = '<div class="photo-placeholder"><span>⚡</span><p>Sin fotos del tablero</p></div>';
            return;
        }
        gallery.innerHTML = tableroPhotos.map((photo, i) =>
            '<div class="photo-item"><img src="' + photo + '" alt="Tablero ' + (i+1) + '">' +
            '<button class="photo-delete" data-index="' + i + '">✕</button>' +
            '<span class="photo-number">' + (i+1) + '/' + tableroPhotos.length + '</span></div>'
        ).join('');
        gallery.querySelectorAll('.photo-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                tableroPhotos.splice(parseInt(btn.dataset.index), 1);
                renderTableroPhotos();
            });
        });
    }

    // ========== FOTOS EQUIPO DE MEDICIÓN ==========
    let equipoPhotos = [];
    function initEquipoPhotos() {
        const camInput = document.getElementById('equipo-camera-input');
        const galInput = document.getElementById('equipo-gallery-input');
        const btnCam = document.getElementById('btn-equipo-camara');
        const btnGal = document.getElementById('btn-equipo-galeria');
        if (btnCam) btnCam.addEventListener('click', () => camInput.click());
        if (btnGal) btnGal.addEventListener('click', () => galInput.click());
        if (camInput) camInput.addEventListener('change', e => handleGenericPhotos(e, equipoPhotos, 5, renderEquipoPhotos));
        if (galInput) galInput.addEventListener('change', e => handleGenericPhotos(e, equipoPhotos, 5, renderEquipoPhotos));
    }
    function renderEquipoPhotos() {
        const gallery = document.getElementById('equipo-gallery');
        if (!gallery) return;
        if (equipoPhotos.length === 0) {
            gallery.innerHTML = '<div class="photo-placeholder"><span>📏</span><p>Sin fotos del equipo</p></div>';
            return;
        }
        gallery.innerHTML = equipoPhotos.map((photo, i) =>
            '<div class="photo-item"><img src="' + photo + '" alt="Equipo ' + (i+1) + '">' +
            '<button class="photo-delete" data-index="' + i + '">✕</button>' +
            '<span class="photo-number">' + (i+1) + '/' + equipoPhotos.length + '</span></div>'
        ).join('');
        gallery.querySelectorAll('.photo-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                equipoPhotos.splice(parseInt(btn.dataset.index), 1);
                renderEquipoPhotos();
            });
        });
    }

    // ========== FOTOS ESPACIO PARA EQUIPOS ==========
    let espacioEquiposPhotos = [];
    function initEspacioEquiposPhotos() {
        const camInput = document.getElementById('espacio-equipos-camera-input');
        const galInput = document.getElementById('espacio-equipos-gallery-input');
        const btnCam = document.getElementById('btn-espacio-equipos-camara');
        const btnGal = document.getElementById('btn-espacio-equipos-galeria');
        if (btnCam) btnCam.addEventListener('click', () => camInput.click());
        if (btnGal) btnGal.addEventListener('click', () => galInput.click());
        if (camInput) camInput.addEventListener('change', e => handleGenericPhotos(e, espacioEquiposPhotos, 5, renderEspacioEquiposPhotos));
        if (galInput) galInput.addEventListener('change', e => handleGenericPhotos(e, espacioEquiposPhotos, 5, renderEspacioEquiposPhotos));
    }
    function renderEspacioEquiposPhotos() {
        const gallery = document.getElementById('espacio-equipos-gallery');
        if (!gallery) return;
        if (espacioEquiposPhotos.length === 0) {
            gallery.innerHTML = '<div class="photo-placeholder"><span>📦</span><p>Sin fotos del espacio</p></div>';
            return;
        }
        gallery.innerHTML = espacioEquiposPhotos.map((photo, i) =>
            '<div class="photo-item"><img src="' + photo + '" alt="Espacio equipos ' + (i+1) + '">' +
            '<button class="photo-delete" data-index="' + i + '">✕</button>' +
            '<span class="photo-number">' + (i+1) + '/' + espacioEquiposPhotos.length + '</span></div>'
        ).join('');
        gallery.querySelectorAll('.photo-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                espacioEquiposPhotos.splice(parseInt(btn.dataset.index), 1);
                renderEspacioEquiposPhotos();
            });
        });
    }

    function handleGenericPhotos(e, arr, max, renderFn) {
        const files = e.target.files;
        if (!files.length) return;
        if (arr.length + files.length > max) {
            showToast('Máximo ' + max + ' fotos permitidas', 'error');
            return;
        }
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                compressImage(ev.target.result, 800, 0.7, (compressed) => {
                    arr.push(compressed);
                    renderFn();
                });
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    }

    // ========== FOTOS TRANSFORMADOR ==========
    let transformadorPhotos = [];
    function initTransformadorPhotos() {
        const camInput = document.getElementById('transformador-camera-input');
        const galInput = document.getElementById('transformador-gallery-input');
        const btnCam = document.getElementById('btn-transformador-camara');
        const btnGal = document.getElementById('btn-transformador-galeria');
        if (btnCam) btnCam.addEventListener('click', () => camInput.click());
        if (btnGal) btnGal.addEventListener('click', () => galInput.click());
        if (camInput) camInput.addEventListener('change', handleTransformadorPhotos);
        if (galInput) galInput.addEventListener('change', handleTransformadorPhotos);
    }
    function handleTransformadorPhotos(e) {
        const files = e.target.files;
        if (!files.length) return;
        if (transformadorPhotos.length + files.length > 5) {
            showToast('Máximo 5 fotos del transformador permitidas', 'error');
            return;
        }
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                compressImage(ev.target.result, 800, 0.7, (compressed) => {
                    transformadorPhotos.push(compressed);
                    renderTransformadorPhotos();
                });
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    }
    function renderTransformadorPhotos() {
        const gallery = document.getElementById('transformador-gallery');
        if (!gallery) return;
        if (transformadorPhotos.length === 0) {
            gallery.innerHTML = '<div class="photo-placeholder"><span>🔌</span><p>Sin fotos del transformador</p></div>';
            return;
        }
        gallery.innerHTML = transformadorPhotos.map((photo, i) =>
            '<div class="photo-item">' +
            '<img src="' + photo + '" alt="Transformador ' + (i + 1) + '">' +
            '<button class="photo-delete" data-index="' + i + '">✕</button>' +
            '<span class="photo-number">' + (i + 1) + '/' + transformadorPhotos.length + '</span>' +
            '</div>'
        ).join('');
        gallery.querySelectorAll('.photo-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                transformadorPhotos.splice(parseInt(btn.dataset.index), 1);
                renderTransformadorPhotos();
            });
        });
    }

    // ========== FOTOS RECIBO ==========
    let reciboPhotos = [];
    function initReciboPhotos() {
        const camInput = document.getElementById('recibo-camera-input');
        const galInput = document.getElementById('recibo-gallery-input');
        const btnCam = document.getElementById('btn-recibo-camara');
        const btnGal = document.getElementById('btn-recibo-galeria');
        if (btnCam) btnCam.addEventListener('click', () => camInput.click());
        if (btnGal) btnGal.addEventListener('click', () => galInput.click());
        if (camInput) camInput.addEventListener('change', handleReciboPhotos);
        if (galInput) galInput.addEventListener('change', handleReciboPhotos);
    }
    function handleReciboPhotos(e) {
        const files = e.target.files;
        if (!files.length) return;
        if (reciboPhotos.length + files.length > 3) {
            showToast('Máximo 3 fotos del recibo permitidas', 'error');
            return;
        }
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                compressImage(ev.target.result, 800, 0.7, (compressed) => {
                    reciboPhotos.push(compressed);
                    renderReciboPhotos();
                });
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    }
    function renderReciboPhotos() {
        const gallery = document.getElementById('recibo-gallery');
        if (!gallery) return;
        if (reciboPhotos.length === 0) {
            gallery.innerHTML = '<div class="photo-placeholder"><span>🧾</span><p>Sin foto del recibo</p></div>';
            return;
        }
        gallery.innerHTML = reciboPhotos.map((photo, i) =>
            '<div class="photo-item">' +
            '<img src="' + photo + '" alt="Recibo ' + (i + 1) + '">' +
            '<button class="photo-delete" data-index="' + i + '">✕</button>' +
            '<span class="photo-number">' + (i + 1) + '/' + reciboPhotos.length + '</span>' +
            '</div>'
        ).join('');
        gallery.querySelectorAll('.photo-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                reciboPhotos.splice(parseInt(btn.dataset.index), 1);
                renderReciboPhotos();
            });
        });
    }

    // ========== FOTOS ÁREA 1 ==========
    let area1Photos = [];
    function initArea1Photos() {
        const camInput = document.getElementById('area-1-camera-input');
        const galInput = document.getElementById('area-1-gallery-input');
        const btnCam = document.getElementById('btn-area-1-camara');
        const btnGal = document.getElementById('btn-area-1-galeria');
        if (btnCam) btnCam.addEventListener('click', () => camInput.click());
        if (btnGal) btnGal.addEventListener('click', () => galInput.click());
        if (camInput) camInput.addEventListener('change', handleArea1Photos);
        if (galInput) galInput.addEventListener('change', handleArea1Photos);
    }
    function handleArea1Photos(e) {
        const files = e.target.files;
        if (!files.length) return;
        if (area1Photos.length + files.length > 5) {
            showToast('Máximo 5 fotos del área permitidas', 'error');
            return;
        }
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                compressImage(ev.target.result, 800, 0.7, (compressed) => {
                    area1Photos.push(compressed);
                    renderArea1Photos();
                });
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    }
    function renderArea1Photos() {
        const gallery = document.getElementById('area-1-gallery');
        if (!gallery) return;
        if (area1Photos.length === 0) {
            gallery.innerHTML = '<div class="photo-placeholder"><span>🏞️</span><p>Sin fotos del área</p></div>';
            return;
        }
        gallery.innerHTML = area1Photos.map((photo, i) =>
            '<div class="photo-item">' +
            '<img src="' + photo + '" alt="Área ' + (i + 1) + '">' +
            '<button class="photo-delete" data-index="' + i + '">✕</button>' +
            '<span class="photo-number">' + (i + 1) + '/' + area1Photos.length + '</span>' +
            '</div>'
        ).join('');
        gallery.querySelectorAll('.photo-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                area1Photos.splice(parseInt(btn.dataset.index), 1);
                renderArea1Photos();
            });
        });
    }

    // ========== FECHA/HORA ACTUAL ==========
    function setFechaHoraActual() {
        const now = new Date();
        document.getElementById('fecha').value = now.toISOString().split('T')[0];
        document.getElementById('hora').value = now.toTimeString().slice(0, 5);
    }

    // ========== NAVEGACIÓN / MENÚ ==========
    function initNavigation() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('overlay');
        const btnMenu = document.getElementById('btn-menu');
        const btnClose = document.getElementById('btn-close-menu');

        btnMenu.addEventListener('click', () => {
            sidebar.classList.add('open');
            overlay.classList.add('active');
        });

        function closeSidebar() {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        }

        btnClose.addEventListener('click', closeSidebar);
        overlay.addEventListener('click', closeSidebar);

        document.querySelectorAll('.sidebar nav a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const action = link.dataset.action;
                document.querySelectorAll('.sidebar nav a').forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

                switch (action) {
                    case 'nueva-visita':
                        document.getElementById('view-nueva-visita').classList.add('active');
                        break;
                    case 'historial':
                        document.getElementById('view-historial').classList.add('active');
                        renderHistorial();
                        break;
                    case 'exportar-todo':
                        exportarTodoExcel();
                        break;
                    case 'sync-sheets':
                        sincronizarGoogleSheets();
                        break;
                    case 'configuracion':
                        document.getElementById('view-configuracion').classList.add('active');
                        updateConfigInfo();
                        break;
                    case 'admin-usuarios':
                        document.getElementById('view-admin-usuarios').classList.add('active');
                        if (window.adminCargarUsuarios) window.adminCargarUsuarios();
                        break;
                }
                closeSidebar();
            });
        });
    }

    // ========== PASOS DEL FORMULARIO ==========
    function initSteps() {
        document.querySelectorAll('.btn-next').forEach(btn => {
            btn.addEventListener('click', () => goToStep(parseInt(btn.dataset.next)));
        });
        document.querySelectorAll('.btn-prev').forEach(btn => {
            btn.addEventListener('click', () => goToStep(parseInt(btn.dataset.prev)));
        });
        // Click directo en los indicadores de paso
        document.querySelectorAll('.step-indicator .step').forEach(step => {
            step.addEventListener('click', () => {
                goToStep(parseInt(step.dataset.step));
            });
        });
    }

    function goToStep(step) {
        document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.step-indicator .step').forEach(s => {
            s.classList.remove('active');
            const stepNum = parseInt(s.dataset.step);
            if (stepNum < step) s.classList.add('completed');
            else s.classList.remove('completed');
        });
        document.getElementById('step-' + step).classList.add('active');
        document.querySelector('.step[data-step="' + step + '"]').classList.add('active');
        currentStep = step;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ========== GPS + ANÁLISIS SOLAR ==========
    function initGPS() {
        // Botón GPS básico del paso 1
        document.getElementById('btn-gps').addEventListener('click', () => {
            if (!navigator.geolocation) {
                showToast('GPS no disponible en este dispositivo', 'error');
                return;
            }
            const btn = document.getElementById('btn-gps');
            btn.textContent = '⏳ Obteniendo...';
            btn.disabled = true;

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const lat = pos.coords.latitude;
                    const lon = pos.coords.longitude;
                    document.getElementById('gps-coords').value =
                        lat.toFixed(6) + ', ' + lon.toFixed(6);
                    btn.textContent = '📍 Obtener';
                    btn.disabled = false;
                    showToast('Ubicación obtenida ✓', 'success');
                    // Intentar obtener la dirección automáticamente (reverse geocoding)
                    obtenerDireccionDesdeGPS(lat, lon);
                },
                (err) => {
                    showToast('Error GPS: ' + err.message, 'error');
                    btn.textContent = '📍 Obtener';
                    btn.disabled = false;
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        });
        // Botón Análisis Solar completo (Paso 2)
        const btnSolar = document.getElementById('btn-solar-analysis');
        if (btnSolar) {
            btnSolar.addEventListener('click', runSolarAnalysis);
        }

        // Botón abrir Google Maps
        const btnGmaps = document.getElementById('btn-open-gmaps');
        if (btnGmaps) {
            btnGmaps.addEventListener('click', () => {
                const coords = document.getElementById('gps-coords').value;
                if (coords) {
                    window.open('https://www.google.com/maps/@' + coords.replace(' ', '') + ',18z/data=!3m1!1e1', '_blank');
                }
            });
        }
    }

    // Reverse geocoding: convierte lat/long en dirección legible (OpenStreetMap Nominatim).
    // Llena el campo dirección automáticamente; el técnico puede editarlo a mano.
    function obtenerDireccionDesdeGPS(lat, lon) {
        const campo = document.getElementById('direccion');
        if (!campo) return;
        const url = 'https://nominatim.openstreetmap.org/reverse?format=json&lat=' +
            lat + '&lon=' + lon + '&accept-language=es&zoom=18';
        fetch(url, { headers: { 'Accept': 'application/json' } })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data || !data.address) return;
                const a = data.address;
                // Armar una dirección compacta tipo Colombia
                const calle = [a.road, a.house_number].filter(Boolean).join(' #');
                const barrio = a.neighbourhood || a.suburb || a.quarter || '';
                const ciudad = a.city || a.town || a.village || a.municipality || '';
                const depto = a.state || '';
                const partes = [calle, barrio, ciudad, depto].filter(Boolean);
                const dir = partes.length ? partes.join(', ') : (data.display_name || '');
                if (dir) {
                    campo.value = dir;
                    showToast('📍 Dirección obtenida — verifica y ajusta si hace falta', 'success');
                }
            })
            .catch(() => { /* sin internet o servicio caído: el técnico la escribe a mano */ });
    }

    function runSolarAnalysis() {
        if (!navigator.geolocation) {
            showToast('GPS no disponible', 'error');
            return;
        }
        const btn = document.getElementById('btn-solar-analysis');
        btn.innerHTML = '⏳ Analizando posición solar...';
        btn.classList.add('loading');

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                const acc = pos.coords.accuracy;
                const alt = pos.coords.altitude;

                // Guardar coords en paso 1 también
                document.getElementById('gps-coords').value = lat.toFixed(6) + ', ' + lng.toFixed(6);

                // Mostrar mapa satelital
                showSatelliteMap(lat, lng);

                // Mostrar datos GPS
                showGPSData(lat, lng, acc, alt);

                // Calcular y mostrar trayectoria solar
                showSunTrajectory(lat, lng);

                btn.innerHTML = '✅ Análisis completado — Toca para actualizar';
                btn.classList.remove('loading');
                showToast('Análisis solar completo ✓', 'success');
            },
            (err) => {
                showToast('Error GPS: ' + err.message, 'error');
                btn.innerHTML = '🛰️ Obtener Análisis Solar';
                btn.classList.remove('loading');
            },
            { enableHighAccuracy: true, timeout: 15000 }
        );
    }

    function showSatelliteMap(lat, lng) {
        const container = document.getElementById('solar-map-container');
        const iframe = document.getElementById('map-iframe');
        // Usar OpenStreetMap embed (gratuito, sin API key)
        iframe.src = 'https://www.openstreetmap.org/export/embed.html?bbox=' +
            (lng - 0.003) + ',' + (lat - 0.002) + ',' + (lng + 0.003) + ',' + (lat + 0.002) +
            '&layer=mapnik&marker=' + lat + ',' + lng;
        container.style.display = 'block';
    }

    function showGPSData(lat, lng, accuracy, altitude) {
        const section = document.getElementById('solar-gps-data');
        document.getElementById('solar-lat').textContent = 'Lat: ' + lat.toFixed(6) + '°';
        document.getElementById('solar-lng').textContent = 'Lng: ' + lng.toFixed(6) + '°';
        document.getElementById('solar-accuracy').textContent = '± ' + (accuracy ? accuracy.toFixed(0) : '--') + ' m';
        document.getElementById('solar-altitude').textContent = altitude ? altitude.toFixed(0) + ' m.s.n.m.' : 'No disponible';
        section.style.display = 'grid';
    }

    // ========== CÁLCULOS SOLARES (SunCalc) ==========
    // Algoritmos basados en NOAA Solar Calculator
    function calcSunPosition(date, lat, lng) {
        const rad = Math.PI / 180;
        const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
        const B = (360 / 365) * (dayOfYear - 81) * rad;

        // Ecuación del tiempo (minutos)
        const EoT = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);

        // Declinación solar
        const decl = 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * rad);
        const declRad = decl * rad;
        const latRad = lat * rad;

        // Hora solar
        const solarNoonMin = 720 - 4 * lng - EoT;
        const tzOffset = -date.getTimezoneOffset();
        const solarNoon = solarNoonMin + tzOffset;

        // Ángulo horario del amanecer/atardecer
        const cosHA = (Math.sin(-0.833 * rad) - Math.sin(latRad) * Math.sin(declRad)) /
                       (Math.cos(latRad) * Math.cos(declRad));

        let sunrise, sunset, daylight;
        if (cosHA > 1 || cosHA < -1) {
            // Sol no sale o no se pone
            sunrise = null; sunset = null; daylight = cosHA < -1 ? 24 : 0;
        } else {
            const HA = Math.acos(cosHA) / rad;
            const riseMin = solarNoon - HA * 4;
            const setMin = solarNoon + HA * 4;
            sunrise = riseMin;
            sunset = setMin;
            daylight = (setMin - riseMin) / 60;
        }

        // Elevación solar máxima (al mediodía solar)
        const maxElevation = 90 - Math.abs(lat - decl);

        // Azimut del amanecer y atardecer
        const cosAzSunrise = (Math.sin(declRad) - Math.sin(latRad) * Math.sin(-0.833 * rad)) /
                              (Math.cos(latRad) * Math.cos(-0.833 * rad));
        const azSunrise = Math.acos(Math.max(-1, Math.min(1, cosAzSunrise))) / rad;
        const azSunset = 360 - azSunrise;

        // Posición actual del sol
        const nowMin = date.getHours() * 60 + date.getMinutes() + tzOffset - (solarNoonMin - 720 + tzOffset);
        const hourAngle = nowMin / 4; // grados
        const hourAngleRad = hourAngle * rad;
        const sinElev = Math.sin(latRad) * Math.sin(declRad) +
                         Math.cos(latRad) * Math.cos(declRad) * Math.cos(hourAngleRad);
        const currentElevation = Math.asin(Math.max(-1, Math.min(1, sinElev))) / rad;

        const cosAz = (Math.sin(declRad) - Math.sin(latRad) * sinElev) /
                       (Math.cos(latRad) * Math.cos(Math.asin(sinElev)));
        let currentAzimuth = Math.acos(Math.max(-1, Math.min(1, cosAz))) / rad;
        if (hourAngle > 0) currentAzimuth = 360 - currentAzimuth;

        return {
            sunrise, sunset, solarNoon, daylight,
            maxElevation, decl,
            azSunrise, azSunset,
            currentElevation, currentAzimuth
        };
    }

    function minToTime(minutes) {
        if (minutes == null) return '--:--';
        const h = Math.floor(minutes / 60) % 24;
        const m = Math.round(minutes % 60);
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }

    function showSunTrajectory(lat, lng) {
        const now = new Date();
        const sun = calcSunPosition(now, lat, lng);
        const section = document.getElementById('solar-sun-data');

        // Tiempos
        document.getElementById('sun-rise-time').textContent = minToTime(sun.sunrise);
        document.getElementById('sun-set-time').textContent = minToTime(sun.sunset);
        document.getElementById('sun-noon-time').textContent = minToTime(sun.solarNoon);

        // Azimuts y elevación
        document.getElementById('sun-rise-azimuth').textContent = 'Azimut: ' + sun.azSunrise.toFixed(1) + '°';
        document.getElementById('sun-set-azimuth').textContent = 'Azimut: ' + sun.azSunset.toFixed(1) + '°';
        document.getElementById('sun-noon-elevation').textContent = 'Elevación máx: ' + sun.maxElevation.toFixed(1) + '°';

        // Extras
        document.getElementById('sun-daylight').textContent = sun.daylight.toFixed(1) + ' horas';

        // Orientación óptima (para hemisferio correspondiente)
        const hemisphere = lat >= 0 ? 'Sur (180°)' : 'Norte (0°)';
        document.getElementById('sun-optimal-orientation').textContent = hemisphere;

        // Inclinación óptima ≈ latitud
        document.getElementById('sun-optimal-tilt').textContent = Math.abs(lat).toFixed(0) + '°';

        // Posición actual
        if (sun.currentElevation > 0) {
            document.getElementById('sun-current-pos').textContent =
                'Az: ' + sun.currentAzimuth.toFixed(0) + '° | Elev: ' + sun.currentElevation.toFixed(1) + '°';
        } else {
            document.getElementById('sun-current-pos').textContent = 'Bajo el horizonte 🌙';
        }

        section.style.display = 'block';

        // Dibujar brújula solar
        drawSolarCompass(sun, lat);
    }

    function drawSolarCompass(sun, lat) {
        const canvas = document.getElementById('solar-compass');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        const cx = w / 2, cy = h / 2, r = (w / 2) - 30;

        ctx.clearRect(0, 0, w, h);

        // Fondo circular
        const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r + 20);
        bgGrad.addColorStop(0, '#E8F0FE');
        bgGrad.addColorStop(1, '#C5D5F0');
        ctx.beginPath();
        ctx.arc(cx, cy, r + 20, 0, Math.PI * 2);
        ctx.fillStyle = bgGrad;
        ctx.fill();

        // Círculos de elevación
        for (let elev = 30; elev <= 90; elev += 30) {
            const eR = r * (1 - elev / 90);
            ctx.beginPath();
            ctx.arc(cx, cy, eR, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(27,46,90,0.15)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = 'rgba(27,46,90,0.35)';
            ctx.font = '9px sans-serif';
            ctx.fillText(elev + '°', cx + 3, cy - eR + 11);
        }

        // Puntos cardinales
        const cardinals = [
            { label: 'N', angle: 0, color: '#E53935' },
            { label: 'E', angle: 90, color: '#1B2E5A' },
            { label: 'S', angle: 180, color: '#1B2E5A' },
            { label: 'O', angle: 270, color: '#1B2E5A' }
        ];
        const rad = Math.PI / 180;
        cardinals.forEach(c => {
            const a = (c.angle - 90) * rad;
            const x = cx + (r + 14) * Math.cos(a);
            const y = cy + (r + 14) * Math.sin(a);
            ctx.fillStyle = c.color;
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(c.label, x, y);
        });

        // Trayectoria del sol (arco de amanecer a atardecer)
        if (sun.sunrise != null && sun.sunset != null) {
            ctx.beginPath();
            ctx.strokeStyle = '#F7941D';
            ctx.lineWidth = 3;
            ctx.setLineDash([]);

            const steps = 60;
            const riseMin = sun.sunrise;
            const setMin = sun.sunset;
            for (let i = 0; i <= steps; i++) {
                const t = riseMin + (setMin - riseMin) * (i / steps);
                const nowDate = new Date();
                const fakeDate = new Date(nowDate);
                const tzOff = -nowDate.getTimezoneOffset();
                // Calcular ángulo horario para este momento
                const minutesFromNoon = t - sun.solarNoon;
                const ha = minutesFromNoon / 4 * rad;
                const latRad = lat * rad;
                const declRad = sun.decl * rad;
                const sinE = Math.sin(latRad) * Math.sin(declRad) + Math.cos(latRad) * Math.cos(declRad) * Math.cos(ha);
                const elev = Math.asin(Math.max(-1, Math.min(1, sinE))) / rad;
                const cosAz = (Math.sin(declRad) - Math.sin(latRad) * sinE) / (Math.cos(latRad) * Math.cos(Math.asin(sinE)));
                let az = Math.acos(Math.max(-1, Math.min(1, cosAz))) / rad;
                if (minutesFromNoon > 0) az = 360 - az;

                const pr = r * (1 - Math.max(0, elev) / 90);
                const pa = (az - 90) * rad;
                const px = cx + pr * Math.cos(pa);
                const py = cy + pr * Math.sin(pa);

                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.stroke();

            // Punto de amanecer 🌅
            const rAz = (sun.azSunrise - 90) * rad;
            ctx.beginPath();
            ctx.arc(cx + r * Math.cos(rAz), cy + r * Math.sin(rAz), 6, 0, Math.PI * 2);
            ctx.fillStyle = '#FFB74D';
            ctx.fill();
            ctx.strokeStyle = '#E65100'; ctx.lineWidth = 1.5; ctx.stroke();

            // Punto de atardecer 🌇
            const sAz = (sun.azSunset - 90) * rad;
            ctx.beginPath();
            ctx.arc(cx + r * Math.cos(sAz), cy + r * Math.sin(sAz), 6, 0, Math.PI * 2);
            ctx.fillStyle = '#E65100';
            ctx.fill();
            ctx.strokeStyle = '#BF360C'; ctx.lineWidth = 1.5; ctx.stroke();

            // Sol actual (si está sobre horizonte)
            if (sun.currentElevation > 0) {
                const cR = r * (1 - sun.currentElevation / 90);
                const cA = (sun.currentAzimuth - 90) * rad;
                const sx = cx + cR * Math.cos(cA);
                const sy = cy + cR * Math.sin(cA);

                // Resplandor
                const sunGlow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 14);
                sunGlow.addColorStop(0, 'rgba(247,148,29,0.8)');
                sunGlow.addColorStop(1, 'rgba(247,148,29,0)');
                ctx.beginPath();
                ctx.arc(sx, sy, 14, 0, Math.PI * 2);
                ctx.fillStyle = sunGlow;
                ctx.fill();

                // Sol
                ctx.beginPath();
                ctx.arc(sx, sy, 7, 0, Math.PI * 2);
                ctx.fillStyle = '#F7941D';
                ctx.fill();
                ctx.strokeStyle = '#FF6F00'; ctx.lineWidth = 2; ctx.stroke();
            }
        }

        // Línea norte (roja)
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx, cy - r);
        ctx.strokeStyle = 'rgba(229,57,53,0.3)';
        ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // ========== FOTOS ==========
    function initPhotos() {
        const cameraInput = document.getElementById('camera-input');
        const galleryInput = document.getElementById('gallery-input');

        document.getElementById('btn-take-photo').addEventListener('click', () => cameraInput.click());
        document.getElementById('btn-upload-photo').addEventListener('click', () => galleryInput.click());

        cameraInput.addEventListener('change', handlePhotos);
        galleryInput.addEventListener('change', handlePhotos);

        initDynamicAreas();
    }

    // Áreas dinámicas disponibles
    function initDynamicAreas() {
        const container = document.getElementById('areas-container');
        const btnAdd = document.getElementById('btn-add-area');
        if (!container || !btnAdd) return;

        btnAdd.addEventListener('click', () => {
            const current = container.querySelectorAll('.area-item').length;
            const index = current + 1;
            const div = document.createElement('div');
            div.className = 'area-item';
            div.dataset.index = String(index);
            div.innerHTML = `
                <div class="form-group">
                    <label for="area-${index}-descripcion">Descripción del área</label>
                    <input type="text" id="area-${index}-descripcion" placeholder="Ej: Techo bodega / parqueadero">
                </div>
                <div class="form-group">
                    <label for="area-${index}-largo">Largo del techo (m)</label>
                    <input type="number" id="area-${index}-largo" step="0.1" placeholder="12.0">
                </div>
                <div class="form-group">
                    <label for="area-${index}-ancho">Ancho del techo (m)</label>
                    <input type="number" id="area-${index}-ancho" step="0.1" placeholder="8.0">
                </div>
                <div class="form-group">
                    <label for="area-${index}-util">Área útil disponible (m²)</label>
                    <input type="number" id="area-${index}-util" step="0.1" placeholder="80.0">
                </div>
                <div class="area-orientacion-box">
                    <span class="area-orientacion-title">📐 Inclinación y Orientación de esta área</span>
                    <div class="form-group">
                        <label for="area-${index}-inclinacion">Inclinación del techo (°)</label>
                        <input type="number" id="area-${index}-inclinacion" step="0.5" placeholder="15">
                    </div>
                    <div class="form-group">
                        <label for="area-${index}-orientacion">Orientación (punto cardinal)</label>
                        <select id="area-${index}-orientacion">
                            <option value="">Seleccionar...</option>
                            <option value="N">N — Norte</option>
                            <option value="NE">NE — Nororiente</option>
                            <option value="E">E — Oriente</option>
                            <option value="SE">SE — Suroriente</option>
                            <option value="S">S — Sur (óptimo)</option>
                            <option value="SO">SO — Suroccidente</option>
                            <option value="O">O — Occidente</option>
                            <option value="NO">NO — Noroccidente</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="area-${index}-azimut">Azimut / Orientación (°)</label>
                        <input type="number" id="area-${index}-azimut" step="1" placeholder="180 = Sur">
                    </div>
                    <div class="form-group">
                        <label for="area-${index}-altura">Altura del techo (m)</label>
                        <input type="number" id="area-${index}-altura" step="0.1" placeholder="3.5">
                    </div>
                </div>
                <div class="form-group">
                    <label for="area-${index}-fotos">📸 Fotos del área</label>
                    <input type="file" id="area-${index}-fotos" accept="image/*" multiple>
                </div>
                <button type="button" class="btn btn-small btn-danger btn-remove-area" style="margin-bottom:0.5rem;">✕ Quitar esta área</button>
                <hr style="margin:0.8rem 0; border:none; border-top:1px dashed var(--border);">
            `;
            container.appendChild(div);

            div.querySelector('.btn-remove-area').addEventListener('click', () => {
                if (container.querySelectorAll('.area-item').length > 1) {
                    container.removeChild(div);
                } else {
                    showToast('Debe haber al menos un área', 'error');
                }
            });
        });
    }

    function handlePhotos(e) {
        const files = e.target.files;
        if (!files.length) return;
        if (photos.length + files.length > 10) {
            showToast('Máximo 10 fotos permitidas', 'error');
            return;
        }
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                compressImage(ev.target.result, 800, 0.7, (compressed) => {
                    photos.push(compressed);
                    renderPhotos();
                });
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    }

    // ========== FOTOS DEL TECHO ==========
    function initTechoPhotos() {
        const techoCamera = document.getElementById('techo-camera-input');
        const techoGallery = document.getElementById('techo-gallery-input');
        
        const btnCamera = document.getElementById('btn-techo-camara');
        const btnGallery = document.getElementById('btn-techo-galeria');
        
        if (btnCamera) btnCamera.addEventListener('click', () => techoCamera.click());
        if (btnGallery) btnGallery.addEventListener('click', () => techoGallery.click());
        
        if (techoCamera) techoCamera.addEventListener('change', handleTechoPhotos);
        if (techoGallery) techoGallery.addEventListener('change', handleTechoPhotos);
    }

    function handleTechoPhotos(e) {
        const files = e.target.files;
        if (!files.length) return;
        if (techoPhotos.length + files.length > 5) {
            showToast('Máximo 5 fotos del techo permitidas', 'error');
            return;
        }
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                compressImage(ev.target.result, 800, 0.7, (compressed) => {
                    techoPhotos.push(compressed);
                    renderTechoPhotos();
                });
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    }

    function renderTechoPhotos() {
        const gallery = document.getElementById('techo-gallery');
        if (!gallery) return;
        
        if (techoPhotos.length === 0) {
            gallery.innerHTML = '<div class="photo-placeholder"><span>🏠</span><p>Sin fotos del techo</p></div>';
            return;
        }
        gallery.innerHTML = techoPhotos.map((photo, i) =>
            '<div class="photo-item">' +
            '<img src="' + photo + '" alt="Techo ' + (i + 1) + '">' +
            '<button class="photo-delete" data-index="' + i + '">✕</button>' +
            '<span class="photo-number">' + (i + 1) + '/' + techoPhotos.length + '</span>' +
            '</div>'
        ).join('');

        gallery.querySelectorAll('.photo-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                techoPhotos.splice(parseInt(btn.dataset.index), 1);
                renderTechoPhotos();
            });
        });
    }

    function compressImage(dataUrl, maxWidth, quality, callback) {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > maxWidth) { h = (maxWidth / w) * h; w = maxWidth; }
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            callback(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = dataUrl;
    }

    function renderPhotos() {
        const gallery = document.getElementById('photo-gallery');
        if (photos.length === 0) {
            gallery.innerHTML = '<div class="photo-placeholder"><span>📷</span><p>Aún no hay fotos</p></div>';
            return;
        }
        gallery.innerHTML = photos.map((photo, i) =>
            '<div class="photo-item">' +
            '<img src="' + photo + '" alt="Foto ' + (i + 1) + '">' +
            '<button class="photo-delete" data-index="' + i + '">✕</button>' +
            '<span class="photo-number">' + (i + 1) + '/' + photos.length + '</span>' +
            '</div>'
        ).join('');

        gallery.querySelectorAll('.photo-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                photos.splice(parseInt(btn.dataset.index), 1);
                renderPhotos();
            });
        });
    }

    // ========== FIRMA DIGITAL ==========
    function initFirma() {
        firmaCanvas = document.getElementById('firma-canvas');
        if (!firmaCanvas) return;
        firmaCtx = firmaCanvas.getContext('2d');

        function resizeCanvas() {
            const container = firmaCanvas.parentElement;
            firmaCanvas.width = container.offsetWidth;
            firmaCanvas.height = 200;
            firmaCtx.strokeStyle = '#333';
            firmaCtx.lineWidth = 2;
            firmaCtx.lineCap = 'round';
            firmaCtx.lineJoin = 'round';
        }
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        firmaCanvas.addEventListener('mousedown', startDraw);
        firmaCanvas.addEventListener('mousemove', draw);
        firmaCanvas.addEventListener('mouseup', stopDraw);
        firmaCanvas.addEventListener('mouseleave', stopDraw);

        firmaCanvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDraw(getTouchPos(e)); });
        firmaCanvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(getTouchPos(e)); });
        firmaCanvas.addEventListener('touchend', stopDraw);

        document.getElementById('btn-limpiar-firma').addEventListener('click', () => {
            firmaCtx.clearRect(0, 0, firmaCanvas.width, firmaCanvas.height);
        });
    }

    function getTouchPos(e) {
        const rect = firmaCanvas.getBoundingClientRect();
        const touch = e.touches[0];
        return { offsetX: touch.clientX - rect.left, offsetY: touch.clientY - rect.top };
    }

    function startDraw(e) {
        firmaDibujando = true;
        firmaCtx.beginPath();
        firmaCtx.moveTo(e.offsetX, e.offsetY);
    }

    function draw(e) {
        if (!firmaDibujando) return;
        firmaCtx.lineTo(e.offsetX, e.offsetY);
        firmaCtx.stroke();
    }

    function stopDraw() { firmaDibujando = false; }

    // ========== ACCIONES (GUARDAR / EXCEL) ==========
    function initActions() {
        const btnGuardar = document.getElementById('btn-guardar');
        const btnExcel = document.getElementById('btn-excel');

        if (btnGuardar) {
            btnGuardar.addEventListener('click', () => {
                const data = recolectarDatos();
                const visitas = JSON.parse(localStorage.getItem('visitas_solar') || '[]');
                if (editingVisitaId !== null) {
                    // Editando: reemplazar la visita existente preservando el id original
                    const idx = visitas.findIndex(v => v.id === editingVisitaId);
                    if (idx >= 0) {
                        data.id = editingVisitaId;
                        data.creadoEn = visitas[idx].creadoEn || data.creadoEn;
                        data.actualizadoEn = new Date().toISOString();
                        visitas[idx] = data;
                        showToast('Visita actualizada ✓', 'success');
                    } else {
                        visitas.push(data);
                        showToast('Visita guardada ✓', 'success');
                    }
                    editingVisitaId = null;
                    actualizarBannerEdicion();
                } else {
                    visitas.push(data);
                    showToast('Visita guardada ✓', 'success');
                }
                localStorage.setItem('visitas_solar', JSON.stringify(visitas));
                updateConfigInfo();
            });
        }

        if (btnExcel) {
            btnExcel.addEventListener('click', () => {
                const data = recolectarDatos();
                generarExcel(data);
            });
        }

        const btnOneDrive = document.getElementById('btn-onedrive');
        if (btnOneDrive) {
            btnOneDrive.addEventListener('click', async () => {
                const data = recolectarDatos();
                if (!data.cliente) { showToast('Completa al menos el nombre del cliente', 'error'); return; }
                btnOneDrive.disabled = true;
                btnOneDrive.textContent = '⏳ Generando...';
                try {
                    const buffer = await generarExcelBuffer(data);
                    const fileName = 'VisitaTecnica_' + (data.cliente || 'cliente').replace(/\s+/g, '_') + '_' + (data.fecha || new Date().toISOString().slice(0,10)) + '.xlsx';
                    if (window.subirAOneDrive) {
                        btnOneDrive.textContent = '⏳ Subiendo...';
                        await window.subirAOneDrive(buffer, fileName);
                    } else {
                        showToast('OneDrive no disponible', 'error');
                    }
                } finally {
                    btnOneDrive.disabled = false;
                    btnOneDrive.textContent = '☁️ Subir a OneDrive';
                }
            });
        }
    }

    async function generarExcelBuffer(data) {
        const workbook = await construirWorkbookVisita(data);
        return workbook.xlsx.writeBuffer();
    }

    function generarExcel(data) {
        construirWorkbookVisita(data).then(workbook => {
            const fileName = 'VisitaTecnica_' + (data.cliente || 'cliente').replace(/\s+/g, '_') + '_' + (data.fecha || new Date().toISOString().slice(0,10)) + '.xlsx';
            workbook.xlsx.writeBuffer().then(buffer => {
                saveAs(new Blob([buffer]), fileName);
                showToast('📊 Excel descargado: ' + fileName, 'success');
            });
        });
    }

    async function construirWorkbookVisita(data) {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Ecowatt E.S.P - Visita Técnica Solar';
        workbook.created = new Date();

        // ── Paleta ───────────────────────────────────────────────
        const AZUL='FF1B2E5A', AZULM='FF2E4A80', NARANJA='FFF7941D';
        const VERDE='FF2E7D32', VERDECL='FFE8F5E9';
        const CELEST='FF00A3E0', CELESTCL='FFE1F5FE';
        const GRIS='FFF5F5F5', WHITE='FFFFFFFF';
        const ORANGECL='FFFFF3E0', BLUECL='FFE8EDF5';
        const vFill = { excelente:'FF4CAF50', bueno:'FF2196F3', regular:'FFFFC107', dificil:'FFFF9800', 'no-viable':'FFC62828' };
        const vTxt  = { excelente:'🟢 EXCELENTE', bueno:'🔵 BUENO', regular:'🟡 REGULAR', dificil:'🟠 DIFÍCIL', 'no-viable':'🔴 NO VIABLE' };

        const fill = a => ({ type:'pattern', pattern:'solid', fgColor:{argb:a} });
        const bdr  = { top:{style:'thin',color:{argb:'FFCCCCCC'}}, left:{style:'thin',color:{argb:'FFCCCCCC'}}, bottom:{style:'thin',color:{argb:'FFCCCCCC'}}, right:{style:'thin',color:{argb:'FFCCCCCC'}} };

        // Enlace Google Maps desde coordenadas
        const coordStr = data.analisisSolar?.coordenadas || data.gps || '';
        // Extrae solo los números decimales para obtener coordenadas limpias
        const coordNums   = coordStr.match(/-?\d+\.\d+/g) || [];
        const coordClean  = coordNums.length >= 2 ? coordNums[0] + ', ' + coordNums[1] : coordStr;
        const mapsUrl     = coordNums.length >= 2
            ? `https://www.google.com/maps/search/?api=1&query=${coordNums[0]},${coordNums[1]}`
            : null;

        // Logo IDs (assigned later, after logos are loaded for Portada)
        let logoEcoId = null, logoSolixId = null;

        // ── Helpers ───────────────────────────────────────────────
        function pageHeader(ws, title, cols) {
            const L = String.fromCharCode(64 + cols);
            // Fila 1: Banda navy con título centrado (sin logos para evitar superposición)
            ws.mergeCells(`A1:${L}1`);
            const h = ws.getCell('A1');
            h.value = '☀  ECOWATT E.S.P   ·   SOLIX SAS   —   ' + title;
            h.fill=fill(AZUL); h.font={name:'Calibri',bold:true,size:14,color:{argb:WHITE}};
            h.alignment={horizontal:'center',vertical:'middle'}; ws.getRow(1).height=34;
            // Fila 2: Metadata
            ws.mergeCells(`A2:${L}2`);
            const s = ws.getCell('A2');
            s.value = 'Generado: ' + new Date().toLocaleString('es-CO') + '   —   Cliente: ' + (data.cliente||'') + '   —   Fecha visita: ' + (data.fecha||'');
            s.fill=fill(AZULM); s.font={name:'Calibri',size:9,italic:true,color:{argb:WHITE}};
            s.alignment={horizontal:'center'}; ws.getRow(2).height=15;
            ws.getRow(3).height=8;
        }

        function pageFooter(ws, cols) {
            const L = String.fromCharCode(64 + cols);
            const r = (ws.lastRow ? ws.lastRow.number : 1) + 2;
            ws.getRow(r-1).height = 4;
            ws.mergeCells(`A${r}:${L}${r}`);
            const f = ws.getCell(`A${r}`);
            f.value = '☀ ECOWATT E.S.P  ×  SOLIX SAS   ·   Sistemas Fotovoltaicos   ·   ID #' + (data.id || '—') + '   ·   ' + new Date().toLocaleDateString('es-CO');
            f.fill = fill(AZUL);
            f.font = {name:'Calibri', size:8, italic:true, color:{argb:WHITE}};
            f.alignment = {horizontal:'center', vertical:'middle'};
            ws.getRow(r).height = 18;
        }

        function secH(ws, row, text, fillColor, cols) {
            const L = String.fromCharCode(64 + (cols||2));
            ws.mergeCells(`A${row}:${L}${row}`);
            const c = ws.getCell(`A${row}`);
            c.value=text; c.fill=fill(fillColor);
            c.font={name:'Calibri',bold:true,size:10,color:{argb:WHITE}};
            c.alignment={horizontal:'left',vertical:'middle',indent:1};
            ws.getRow(row).height=22;
        }

        function addLV(ws, row, label, value, lfill, cols) {
            cols = cols||2;
            const c1 = ws.getCell(`A${row}`);
            c1.value=label; c1.fill=fill(lfill||GRIS);
            c1.font={name:'Calibri',bold:true,size:10}; c1.border=bdr;
            c1.alignment={vertical:'middle',indent:1};
            if (cols > 2) ws.mergeCells(`B${row}:${String.fromCharCode(64+cols)}${row}`);
            const c2 = ws.getCell(`B${row}`);
            c2.value=(value!==undefined&&value!==null&&String(value).trim()!=='')?value:'-';
            c2.font={name:'Calibri',size:10}; c2.border=bdr;
            c2.alignment={vertical:'middle',wrapText:true,indent:1};
            ws.getRow(row).height=20;
        }

        function addHyperlink(ws, row, label, text, url, lfill, cols) {
            cols=cols||2;
            const c1=ws.getCell(`A${row}`);
            c1.value=label; c1.fill=fill(lfill||GRIS);
            c1.font={name:'Calibri',bold:true,size:10}; c1.border=bdr;
            c1.alignment={vertical:'middle',indent:1};
            if (cols>2) ws.mergeCells(`B${row}:${String.fromCharCode(64+cols)}${row}`);
            const c2=ws.getCell(`B${row}`);
            if (url) { c2.value={text:text||url,hyperlink:url}; c2.font={name:'Calibri',size:10,color:{argb:'FF0563C1'},underline:true,bold:true}; }
            else { c2.value=text||'-'; c2.font={name:'Calibri',size:10}; }
            c2.border=bdr; c2.alignment={vertical:'middle',indent:1};
            ws.getRow(row).height=20;
        }

        function checkRow(ws, row, label, estado) {
            const colors={si:'FF4CAF50',no:'FFF44336',bien:'FF4CAF50',regular:'FFFFC107',mal:'FFF44336',na:'FF9E9E9E'};
            const texts={si:'✅  SÍ',no:'❌  NO',bien:'✅  BIEN',regular:'⚠️  REGULAR',mal:'❌  MAL',na:'➖  N/A'};
            const c1=ws.getCell(`A${row}`);
            c1.value=label; c1.fill=fill(GRIS); c1.font={name:'Calibri',size:10}; c1.border=bdr;
            c1.alignment={vertical:'middle',indent:1};
            const c2=ws.getCell(`B${row}`);
            c2.value=texts[estado]||(estado?estado:'-');
            c2.border=bdr; c2.alignment={horizontal:'center',vertical:'middle'};
            c2.font={name:'Calibri',bold:true,size:10,color:{argb:estado==='regular'?'FF000000':WHITE}};
            if (colors[estado]) c2.fill=fill(colors[estado]);
            ws.getRow(row).height=20;
        }

        function solRow(ws, row, icon, label, value, extra) {
            const c1=ws.getCell(`A${row}`);
            c1.value=icon+'  '+label; c1.fill=fill(ORANGECL);
            c1.font={name:'Calibri',bold:true,size:10}; c1.border=bdr;
            c1.alignment={vertical:'middle',indent:1};
            const c2=ws.getCell(`B${row}`);
            c2.value=value||'-'; c2.font={name:'Calibri',bold:true,size:11,color:{argb:value?AZUL:'FF9E9E9E'}};
            c2.border=bdr; c2.alignment={horizontal:'center',vertical:'middle'};
            const c3=ws.getCell(`C${row}`);
            c3.value=extra||''; c3.font={name:'Calibri',size:9,italic:true};
            c3.border=bdr; c3.alignment={vertical:'middle'};
            ws.getRow(row).height=22;
        }

        const blank=(ws,row)=>{ ws.getRow(row).height=6; };

        // ── Helper: cargar imagen como base64 (para logos del header) ──
        async function loadImageBase64(url) {
            try {
                const r = await fetch(url);
                const b = await r.blob();
                return await new Promise(function(res) {
                    const fr = new FileReader();
                    fr.onloadend = function() { res(fr.result); };
                    fr.readAsDataURL(b);
                });
            } catch (e) { return null; }
        }

        // ══════════════════════════════════════════════════════════
        // HOJA 1 — PORTADA (Cover Page)
        // ══════════════════════════════════════════════════════════
        const wsP = workbook.addWorksheet('🏠 Portada');
        wsP.properties.tabColor = { argb: NARANJA };
        wsP.columns = [{width:20},{width:18},{width:18},{width:18},{width:20}];
        wsP.views = [{showGridLines: false}];

        // Cargar logos para embeber (UNA sola vez para toda la workbook)
        const logoEco = await loadImageBase64('icons/logo-ecowatt.png');
        const logoSolix = await loadImageBase64('icons/logo-solix.png');
        if (logoEco)   { try { logoEcoId   = workbook.addImage({base64: logoEco,   extension: 'png'}); } catch(e) {} }
        if (logoSolix) { try { logoSolixId = workbook.addImage({base64: logoSolix, extension: 'png'}); } catch(e) {} }

        let pr = 1;
        // Spacer top
        wsP.getRow(pr++).height = 6;

        // Logo banner row (white background)
        const logoRow = pr;
        wsP.getRow(pr).height = 64;
        wsP.mergeCells(`A${pr}:E${pr}`);
        const logoBg = wsP.getCell(`A${pr}`);
        logoBg.fill = fill(WHITE);
        logoBg.border = {bottom:{style:'medium',color:{argb:NARANJA}}};
        pr++;
        if (logoEcoId !== null) {
            try { wsP.addImage(logoEcoId, {tl:{col:0.4, row:logoRow-0.92}, ext:{width:130, height:58}}); } catch (e) {}
        }
        if (logoSolixId !== null) {
            try { wsP.addImage(logoSolixId, {tl:{col:3.5, row:logoRow-0.88}, ext:{width:100, height:50}}); } catch (e) {}
        }

        // Hero title
        wsP.mergeCells(`A${pr}:E${pr}`);
        const heroC = wsP.getCell(`A${pr}`);
        heroC.value = 'REPORTE DE VISITA TÉCNICA SOLAR';
        heroC.fill = fill(AZUL);
        heroC.font = {name:'Calibri', bold:true, size:20, color:{argb:NARANJA}};
        heroC.alignment = {horizontal:'center', vertical:'middle'};
        wsP.getRow(pr).height = 42;
        pr++;

        // Subtitle bar
        wsP.mergeCells(`A${pr}:E${pr}`);
        const subC = wsP.getCell(`A${pr}`);
        subC.value = 'ECOWATT E.S.P  ·  SOLIX SAS  —  Sistemas Fotovoltaicos';
        subC.fill = fill(AZULM);
        subC.font = {name:'Calibri', size:10, italic:true, color:{argb:WHITE}};
        subC.alignment = {horizontal:'center'};
        wsP.getRow(pr).height = 20;
        pr++;
        blank(wsP, pr++);

        // Helper para filas label/value de la portada
        const pRow = (label, value, fillColor) => {
            const c1 = wsP.getCell(`A${pr}`);
            c1.value = label; c1.fill = fill(GRIS);
            c1.font = {name:'Calibri', bold:true, size:10}; c1.border = bdr;
            c1.alignment = {vertical:'middle', indent:1};
            wsP.mergeCells(`B${pr}:E${pr}`);
            const c2 = wsP.getCell(`B${pr}`);
            c2.value = (value !== undefined && value !== null && String(value).trim() !== '') ? value : '-';
            c2.fill = fillColor ? fill(fillColor) : null;
            c2.font = {name:'Calibri', size:11, bold:true, color:{argb:AZUL}};
            c2.border = bdr;
            c2.alignment = {vertical:'middle', indent:1, wrapText:true};
            wsP.getRow(pr).height = 22;
            pr++;
        };

        // Info de la visita
        secH(wsP, pr++, '📋  INFORMACIÓN DE LA VISITA', AZUL, 5);
        pRow('👤  Cliente', data.cliente, BLUECL);
        pRow('📅  Fecha de Visita', data.fecha, BLUECL);
        pRow('🕐  Hora', data.hora, BLUECL);
        pRow('🧑‍🔧  Asesor / Técnico', data.responsableVisita, BLUECL);
        pRow('📞  Teléfono', data.telefono, BLUECL);
        pRow('📧  Email', data.email, BLUECL);
        pRow('📍  Dirección', data.direccion, BLUECL);
        // GPS + Maps link
        {
            const c1 = wsP.getCell(`A${pr}`);
            c1.value = '🗺️  Ubicación GPS'; c1.fill = fill(GRIS);
            c1.font = {name:'Calibri', bold:true, size:10}; c1.border = bdr;
            c1.alignment = {vertical:'middle', indent:1};
            wsP.mergeCells(`B${pr}:E${pr}`);
            const c2 = wsP.getCell(`B${pr}`);
            if (mapsUrl) {
                c2.value = {text: (coordClean || 'Sin GPS') + '   ▶ Abrir en Google Maps', hyperlink: mapsUrl};
                c2.font = {name:'Calibri', size:11, bold:true, color:{argb:'FF0563C1'}, underline:true};
            } else {
                c2.value = coordClean || '-';
                c2.font = {name:'Calibri', size:11, bold:true, color:{argb:AZUL}};
            }
            c2.fill = fill(BLUECL); c2.border = bdr;
            c2.alignment = {vertical:'middle', indent:1};
            wsP.getRow(pr).height = 22;
            pr++;
        }
        blank(wsP, pr++);

        // Viabilidad badge GRANDE
        const viabKey = data.viabilidad;
        const viabTxt = vTxt[viabKey] || 'SIN EVALUAR';
        const viabColor = vFill[viabKey] || 'FF9E9E9E';
        secH(wsP, pr++, '🏆  VIABILIDAD DEL PROYECTO', viabColor, 5);
        wsP.mergeCells(`A${pr}:E${pr}`);
        const viabCell = wsP.getCell(`A${pr}`);
        viabCell.value = viabTxt;
        viabCell.fill = fill(viabColor);
        viabCell.font = {name:'Calibri', bold:true, size:26, color:{argb: viabKey==='regular' ? 'FF000000' : WHITE}};
        viabCell.alignment = {horizontal:'center', vertical:'middle'};
        viabCell.border = bdr;
        wsP.getRow(pr).height = 60;
        pr++;
        blank(wsP, pr++);

        // POTENCIAL SOLAR — 3 stat blocks horizontales
        secH(wsP, pr++, '☀️  POTENCIAL SOLAR ESTIMADO', NARANJA, 5);
        const ps = data.potencialSolar;
        if (ps) {
            // Row 1: valores grandes
            // Stat 1 (A-B): kWp
            wsP.mergeCells(`A${pr}:B${pr}`);
            const s1 = wsP.getCell(`A${pr}`);
            s1.value = ps.kwp; s1.fill = fill(ORANGECL);
            s1.font = {name:'Calibri', bold:true, size:28, color:{argb:NARANJA}};
            s1.alignment = {horizontal:'center', vertical:'middle'};
            s1.border = bdr;
            // Stat 2 (C): paneles
            const s2 = wsP.getCell(`C${pr}`);
            s2.value = ps.panels; s2.fill = fill(ORANGECL);
            s2.font = {name:'Calibri', bold:true, size:28, color:{argb:NARANJA}};
            s2.alignment = {horizontal:'center', vertical:'middle'};
            s2.border = bdr;
            // Stat 3 (D-E): kWh/año
            wsP.mergeCells(`D${pr}:E${pr}`);
            const s3 = wsP.getCell(`D${pr}`);
            s3.value = ps.anual.toLocaleString('es-CO'); s3.fill = fill(ORANGECL);
            s3.font = {name:'Calibri', bold:true, size:24, color:{argb:NARANJA}};
            s3.alignment = {horizontal:'center', vertical:'middle'};
            s3.border = bdr;
            wsP.getRow(pr).height = 46;
            pr++;

            // Row 2: units
            wsP.mergeCells(`A${pr}:B${pr}`);
            const u1 = wsP.getCell(`A${pr}`); u1.value = 'kWp DEL SISTEMA';
            u1.fill = fill(ORANGECL); u1.font = {name:'Calibri', bold:true, size:9, color:{argb:AZULM}};
            u1.alignment = {horizontal:'center'}; u1.border = bdr;
            const u2 = wsP.getCell(`C${pr}`); u2.value = 'PANELES 550W';
            u2.fill = fill(ORANGECL); u2.font = {name:'Calibri', bold:true, size:9, color:{argb:AZULM}};
            u2.alignment = {horizontal:'center'}; u2.border = bdr;
            wsP.mergeCells(`D${pr}:E${pr}`);
            const u3 = wsP.getCell(`D${pr}`); u3.value = 'kWh / AÑO ESTIMADOS';
            u3.fill = fill(ORANGECL); u3.font = {name:'Calibri', bold:true, size:9, color:{argb:AZULM}};
            u3.alignment = {horizontal:'center'}; u3.border = bdr;
            wsP.getRow(pr).height = 18;
            pr++;
            blank(wsP, pr++);

            pRow('☀️  Calidad HSP', ps.calidadHSP + '   (' + (data.mediciones.horasSolarPico || '-') + ' HSP/día)', ORANGECL);
            pRow('⚡  Consumo Mensual Cliente', ps.consumoMensual + ' kWh/mes', ORANGECL);
            pRow('🔬  Fórmula', '(consumo/30) ÷ HSP ÷ 0.85 → kWp  ·  kWp×1000÷550 → paneles', GRIS);
        } else {
            wsP.mergeCells(`A${pr}:E${pr}`);
            const noPs = wsP.getCell(`A${pr}`);
            noPs.value = '⚠ Datos insuficientes para estimar (faltan: consumo mensual y/o HSP)';
            noPs.fill = fill(GRIS);
            noPs.font = {name:'Calibri', italic:true, size:10, color:{argb:'FF666666'}};
            noPs.alignment = {horizontal:'center', vertical:'middle'};
            noPs.border = bdr;
            wsP.getRow(pr).height = 32;
            pr++;
        }
        blank(wsP, pr++);

        // Brújula solar embebida
        if (data.brujulaSolarImg && data.brujulaSolarImg.startsWith('data:image')) {
            secH(wsP, pr++, '🧭  BRÚJULA SOLAR — TRAYECTORIA DEL DÍA', AZULM, 5);
            const compassRow = pr;
            wsP.getRow(pr).height = 175;
            wsP.mergeCells(`A${pr}:E${pr}`);
            wsP.getCell(`A${pr}`).fill = fill(WHITE);
            wsP.getCell(`A${pr}`).border = bdr;
            try {
                const bImg = workbook.addImage({base64: data.brujulaSolarImg, extension: 'png'});
                wsP.addImage(bImg, {tl:{col:1.6, row:compassRow-0.95}, ext:{width:210, height:170}});
            } catch (e) {}
            pr++;
            blank(wsP, pr++);
        }

        // Footer
        wsP.mergeCells(`A${pr}:E${pr}`);
        const footC = wsP.getCell(`A${pr}`);
        const idStr = data.id ? ('ID #' + data.id) : '';
        footC.value = 'Generado ' + new Date().toLocaleString('es-CO') + '   ·   ' + idStr + '   ·   ECOWATT E.S.P × SOLIX SAS';
        footC.fill = fill(AZUL);
        footC.font = {name:'Calibri', size:9, italic:true, color:{argb:WHITE}};
        footC.alignment = {horizontal:'center', vertical:'middle'};
        wsP.getRow(pr).height = 22;

        // ══════════════════════════════════════════════════════════
        // HOJA 2 — DATOS DEL CLIENTE
        // ══════════════════════════════════════════════════════════
        const ws2=workbook.addWorksheet('👤 Datos del Cliente');
        let r=4;
        pageHeader(ws2,'DATOS DEL CLIENTE Y SITIO',3);

        secH(ws2,r++,'🗓️  INFORMACIÓN DE LA VISITA',AZUL,3);
        addLV(ws2,r++,'Fecha de la Visita',data.fecha,BLUECL,3);
        addLV(ws2,r++,'Hora',data.hora,BLUECL,3);
        addLV(ws2,r++,'Asesor / Responsable de la Visita',data.responsableVisita,BLUECL,3);
        blank(ws2,r++);

        secH(ws2,r++,'👤  DATOS DEL CLIENTE',AZULM,3);
        addLV(ws2,r++,'Nombre del Cliente / Empresa',data.cliente,BLUECL,3);
        addLV(ws2,r++,'Correo Electrónico',data.email,BLUECL,3);
        addLV(ws2,r++,'Teléfono',data.telefono,BLUECL,3);
        addLV(ws2,r++,'Tipo de Cliente',data.tipoCliente,BLUECL,3);
        blank(ws2,r++);

        secH(ws2,r++,'📍  UBICACIÓN DEL SITIO',CELEST,3);
        addLV(ws2,r++,'Dirección de Instalación',data.direccion,CELESTCL,3);
        addLV(ws2,r++,'Coordenadas GPS',coordClean,CELESTCL,3);
        if (mapsUrl) addHyperlink(ws2,r++,'📍 Google Maps','▶ Abrir ubicación en Google Maps',mapsUrl,CELESTCL,3);
        blank(ws2,r++);

        secH(ws2,r++,'⚡  CONSUMO ENERGÉTICO',NARANJA,3);
        addLV(ws2,r++,'Tipo de Clima / Piso Térmico',climaLabel(data.clima),ORANGECL,3);
        addLV(ws2,r++,'Kilovatios Contratados (kW)',data.kilovatiosContratados,ORANGECL,3);
        addLV(ws2,r++,'Proveedor de Energía',data.proveedorEnergia,ORANGECL,3);
        addLV(ws2,r++,'Número del Servicio',data.numeroServicio,ORANGECL,3);
        addLV(ws2,r++,'Respaldo de Baterías Requerido (horas)',(data.horasRespaldo&&parseFloat(data.horasRespaldo)>0)?(data.horasRespaldo+' h'):'Sin baterías',ORANGECL,3);
        if (data.numBaterias) addLV(ws2,r++,'Número de Baterías Requeridas (estimado)',data.numBaterias,ORANGECL,3);
        addLV(ws2,r++,'Último consumo del mes (kWh)',data.ultimoConsumoMes,ORANGECL,3);
        addLV(ws2,r++,'Consumo en los últimos 6 meses (kWh)',data.consumo6Meses,ORANGECL,3);
        blank(ws2,r++);

        secH(ws2,r++,'💡  MOTIVO / INTERÉS DEL CLIENTE',VERDE,3);
        ws2.mergeCells(`A${r}:C${r}`);
        const motCell=ws2.getCell(`A${r}`);
        motCell.value=data.motivo||'-'; motCell.fill=fill(VERDECL);
        motCell.font={name:'Calibri',size:11}; motCell.border=bdr;
        motCell.alignment={wrapText:true,vertical:'middle',indent:1}; ws2.getRow(r).height=36;
        ws2.columns=[{width:36},{width:30},{width:10}];
        pageFooter(ws2, 3);

        // ══════════════════════════════════════════════════════════
        // HOJA 3 — EVALUACIÓN TÉCNICA
        // ══════════════════════════════════════════════════════════
        const ws3=workbook.addWorksheet('✅ Evaluación Técnica');
        pageHeader(ws3,'EVALUACIÓN TÉCNICA DEL SITIO',2); r=4;
        const cl=data.checklist||{};

        secH(ws3,r++,'🏠  ESTRUCTURA DEL TECHO',AZUL,2);
        checkRow(ws3,r++,'Estado del techo',cl['techo-estado']);
        checkRow(ws3,r++,'Capacidad de carga del techo',cl['carga-techo']);
        checkRow(ws3,r++,'Impermeabilización',cl['impermeabilizacion']);
        checkRow(ws3,r++,'¿Cuenta con certificación de carga?',cl['cert-carga']);
        addLV(ws3,r++,'Fecha de certificación de carga',data.certCargaFecha,GRIS,2);
        checkRow(ws3,r++,'¿Requiere recertificación de carga?',cl['recertificacion']);
        addLV(ws3,r++,'Tipo de Techo / Estructura',data.tipoTecho,GRIS,2);
        blank(ws3,r++);

        secH(ws3,r++,'🧭  ORIENTACIÓN Y EXPOSICIÓN SOLAR',CELEST,2);
        checkRow(ws3,r++,'Orientación sur',cl['orientacion-sur']);
        checkRow(ws3,r++,'Libre de sombras y obstáculos',cl['sombras']);
        checkRow(ws3,r++,'Espacio disponible suficiente',cl['espacio']);
        blank(ws3,r++);

        secH(ws3,r++,'⚡  INSTALACIÓN ELÉCTRICA EXISTENTE',NARANJA,2);
        checkRow(ws3,r++,'Centro de carga / Tablero principal',cl['centro-carga']);
        addLV(ws3,r++,'Tipo de Medidor Actual',data.tipoMedidor,ORANGECL,2);
        checkRow(ws3,r++,'¿Requiere medidor bidireccional?',cl['requiere-bidireccional']);
        addLV(ws3,r++,'Espacio para medidor bidireccional y baterías',espacioMBLabel(data.espacioMedidorBaterias),ORANGECL,2);
        checkRow(ws3,r++,'Cables de tierra física y neutro',cl['tierra']);
        checkRow(ws3,r++,'Protecciones en línea (fusibles, breakers)',cl['protecciones']);
        checkRow(ws3,r++,'Ruta de cableado disponible',cl['ruta-cable']);
        addLV(ws3,r++,'Distancia Tablero → Paneles (m)',data.distanciaTableroPaneles,ORANGECL,2);
        addLV(ws3,r++,'Potencia del Transformador (kVA)',data.transformadorPotencia,ORANGECL,2);
        blank(ws3,r++);

        secH(ws3,r++,'📄  PROVEEDOR Y CONTRATO',VERDE,2);
        checkRow(ws3,r++,'Contrato vigente con proveedor de energía',cl['contrato-proveedor']);
        addLV(ws3,r++,'Proveedor de Energía',data.proveedorEnergia,VERDECL,2);
        addLV(ws3,r++,'Número del Servicio',data.numeroServicio,VERDECL,2);
        blank(ws3,r++);

        secH(ws3,r++,'🚗  ACCESO Y LOGÍSTICA',AZULM,2);
        checkRow(ws3,r++,'Acceso al medidor',cl['acceso-medidor']);
        checkRow(ws3,r++,'¿Hay acceso al techo?',cl['acceso-techo']);
        addLV(ws3,r++,'Tipo de Acceso / Escalera',accesoTechoLabel(data.tipoAccesoTecho),BLUECL,2);
        checkRow(ws3,r++,'Acceso vehicular para materiales',cl['acceso-vehicular']);
        checkRow(ws3,r++,'¿Requiere andamio?',cl['andamio']);
        checkRow(ws3,r++,'¿Hay espacio para los equipos?',cl['espacio-equipos']);
        checkRow(ws3,r++,'¿Requiere adecuación de espacio?',cl['adecuacion-espacio']);
        addLV(ws3,r++,'Tipo de Obstáculos / Dificultades',data.tipoObstaculos,BLUECL,2);
        blank(ws3,r++);

        secH(ws3,r++,'📝  OBSERVACIONES DEL SITIO',GRIS,2);
        ws3.mergeCells(`A${r}:B${r}`);
        const obsC=ws3.getCell(`A${r}`);
        obsC.value=data.observacionesChecklist||'-';
        obsC.font={name:'Calibri',size:10}; obsC.border=bdr;
        obsC.alignment={wrapText:true,vertical:'top'}; ws3.getRow(r).height=60;
        ws3.columns=[{width:46},{width:24}];
        pageFooter(ws3, 2);

        // ══════════════════════════════════════════════════════════
        // HOJA 4 — ANÁLISIS SOLAR Y GEOLOCALIZACIÓN
        // ══════════════════════════════════════════════════════════
        const ws4=workbook.addWorksheet('☀️ Análisis Solar');
        pageHeader(ws4,'ANÁLISIS SOLAR Y GEOLOCALIZACIÓN',3); r=4;
        const sol=data.analisisSolar||{};

        secH(ws4,r++,'📍  GEOLOCALIZACIÓN DEL SITIO',AZUL,3);
        // Fila coordenadas
        {
            const cA=ws4.getCell(`A${r}`);
            cA.value='Coordenadas GPS'; cA.fill=fill(CELESTCL); cA.font={name:'Calibri',bold:true,size:10}; cA.border=bdr; cA.alignment={vertical:'middle',indent:1};
            ws4.mergeCells(`B${r}:C${r}`);
            const cB=ws4.getCell(`B${r}`);
            cB.value=coordClean||'-'; cB.font={name:'Calibri',size:10}; cB.border=bdr; cB.alignment={vertical:'middle',indent:1};
            ws4.getRow(r).height=20; r++;
        }
        // Enlace Google Maps — destacado
        if (mapsUrl) {
            ws4.mergeCells(`A${r}:C${r}`);
            const mCell=ws4.getCell(`A${r}`);
            mCell.value={text:'📍  Abrir ubicación del sitio en Google Maps  ▶',hyperlink:mapsUrl};
            mCell.fill=fill('FF1565C0');
            mCell.font={name:'Calibri',bold:true,size:11,color:{argb:WHITE},underline:true};
            mCell.alignment={horizontal:'center',vertical:'middle'};
            mCell.border={top:{style:'medium',color:{argb:'FF0D47A1'}},left:{style:'medium',color:{argb:'FF0D47A1'}},bottom:{style:'medium',color:{argb:'FF0D47A1'}},right:{style:'medium',color:{argb:'FF0D47A1'}}};
            ws4.getRow(r).height=28; r++;
        }
        solRow(ws4,r++,'🎯','Precisión GPS',sol.precisionGPS,'');
        solRow(ws4,r++,'🏔️','Altitud sobre nivel del mar',sol.altitud,'');
        blank(ws4,r++);

        secH(ws4,r++,'☀️  TRAYECTORIA SOLAR DEL DÍA',NARANJA,3);
        // Encabezados tabla solar
        ['Momento del Día','Hora','Azimut / Elevación'].forEach((h,i)=>{
            const c=ws4.getRow(r).getCell(i+1);
            c.value=h; c.fill=fill(NARANJA); c.font={name:'Calibri',bold:true,size:10,color:{argb:WHITE}};
            c.border=bdr; c.alignment={horizontal:'center',vertical:'middle'};
        });
        ws4.getRow(r).height=22; r++;
        solRow(ws4,r++,'🌅','Amanecer',sol.amanecer,sol.amanecerAzimut||'');
        solRow(ws4,r++,'☀️','Cénit Solar (mediodía solar)',sol.cenitSolar,sol.cenitElevacion?'Elevación: '+sol.cenitElevacion:'');
        solRow(ws4,r++,'🌇','Atardecer',sol.atardecer,sol.atardecerAzimut||'');
        solRow(ws4,r++,'🕐','Horas de Luz Solar',sol.horasLuz,'horas/día');
        blank(ws4,r++);

        secH(ws4,r++,'🔧  CONDICIONES ÓPTIMAS PARA INSTALACIÓN DE PANELES',VERDE,3);
        solRow(ws4,r++,'🧭','Orientación Óptima para los Paneles',sol.orientacionOptima,'');
        solRow(ws4,r++,'📐','Inclinación Óptima de los Paneles',sol.inclinacionOptima,'');
        solRow(ws4,r++,'🌡️','Posición Solar al momento de la visita',sol.posicionSolarActual,'');
        ws4.columns=[{width:40},{width:22},{width:28}];
        pageFooter(ws4, 3);

        // ══════════════════════════════════════════════════════════
        // HOJA 5 — MEDICIONES DEL SITIO
        // ══════════════════════════════════════════════════════════
        const ws5=workbook.addWorksheet('📏 Mediciones');
        pageHeader(ws5,'MEDICIONES DEL SITIO',3); r=4;
        const med=data.mediciones||{};

        secH(ws5,r++,'📐  ÁREAS DISPONIBLES',AZUL,3);
        // Encabezados áreas
        ['Descripción del Área','Dimensiones (m)','Área Útil (m²)'].forEach((h,i)=>{
            const c=ws5.getRow(r).getCell(i+1);
            c.value=h; c.fill=fill(AZUL); c.font={name:'Calibri',bold:true,size:10,color:{argb:WHITE}};
            c.border=bdr; c.alignment={horizontal:'center',vertical:'middle'};
        });
        ws5.getRow(r).height=22; r++;
        if (data.areas&&data.areas.length>0) {
            data.areas.forEach((a,idx)=>{
                const ar=ws5.getRow(r);
                const ev=idx%2===0?BLUECL:'';
                [a.descripcion||('Área '+(idx+1)), (a.largo&&a.ancho)?a.largo+' × '+a.ancho+' m':'-', a.areaUtil?(a.areaUtil+' m²'):'-'].forEach((v,i)=>{
                    const c=ar.getCell(i+1); c.value=v||'-'; c.border=bdr;
                    c.font={name:'Calibri',size:10}; c.alignment={vertical:'middle',indent:1};
                    if(ev) c.fill=fill(ev);
                });
                ar.height=20; r++;
            });
        } else {
            ws5.mergeCells(`A${r}:C${r}`);
            ws5.getCell(`A${r}`).value='Sin áreas registradas'; ws5.getCell(`A${r}`).border=bdr;
            ws5.getRow(r).height=20; r++;
        }
        blank(ws5,r++);

        // Inclinación y orientación por cada área
        if (data.areas&&data.areas.length>0) {
            data.areas.forEach((a,idx)=>{
                const nombre = a.descripcion || ('Área '+(idx+1));
                secH(ws5,r++,'📐  INCLINACIÓN Y ORIENTACIÓN — '+nombre.toUpperCase(),CELEST,3);
                addLV(ws5,r++,'Inclinación del Techo (°)',a.inclinacion,CELESTCL,3);
                addLV(ws5,r++,'Orientación (punto cardinal)',a.orientacionCardinal,CELESTCL,3);
                addLV(ws5,r++,'Azimut / Orientación (°)  —  180° = Sur',a.azimut,CELESTCL,3);
                addLV(ws5,r++,'Altura del Techo (m)',a.altura,CELESTCL,3);
                blank(ws5,r++);
            });
        }


        secH(ws5,r++,'☀️  IRRADIACIÓN SOLAR',NARANJA,3);
        addLV(ws5,r++,'Horas Solar Pico (HSP)',(med.horasSolarPico||'-')+' HSP/día',ORANGECL,3);
        addLV(ws5,r++,'Irradiancia Promedio',(med.irradiancia||'-')+' kWh/m²/día',ORANGECL,3);
        blank(ws5,r++);

        secH(ws5,r++,'⚡  ELÉCTRICO EXISTENTE',VERDE,3);
        addLV(ws5,r++,'Voltaje de Red (V)',med.voltajeRed,VERDECL,3);
        addLV(ws5,r++,'Interruptor Principal (A)',med.capacidadInterruptor,VERDECL,3);
        addLV(ws5,r++,'Calibre de Acometida',med.calibreAcometida,VERDECL,3);
        addLV(ws5,r++,'Tipo de Medidor Actual',data.tipoMedidor,VERDECL,3);
        checkRow(ws5,r++,'¿Requiere medidor bidireccional?',cl['requiere-bidireccional']);
        addLV(ws5,r++,'Espacio para medidor bidireccional y baterías',espacioMBLabel(data.espacioMedidorBaterias),VERDECL,3);
        addLV(ws5,r++,'Distancia Tablero → Paneles (m)',data.distanciaTableroPaneles,VERDECL,3);
        addLV(ws5,r++,'Potencia del Transformador (kVA)',data.transformadorPotencia,VERDECL,3);
        blank(ws5,r++);
        checkRow(ws5,r++,'¿Hay espacio para los equipos?',cl['espacio-equipos']);
        checkRow(ws5,r++,'¿Requiere adecuación de espacio?',cl['adecuacion-espacio']);
        addLV(ws5,r++,'Tipo de Acceso al Techo',accesoTechoLabel(data.tipoAccesoTecho),VERDECL,3);
        blank(ws5,r++);

        secH(ws5,r++,'🔧  EQUIPO DE MEDICIÓN',AZULM,3);
        addLV(ws5,r++,'Equipo utilizado',data.equipoMedicion,BLUECL,3);
        blank(ws5,r++);

        secH(ws5,r++,'📝  OBSERVACIONES DE MEDICIONES',GRIS,3);
        ws5.mergeCells(`A${r}:C${r}`);
        const obsMed=ws5.getCell(`A${r}`);
        obsMed.value=data.observacionesMediciones||'-';
        obsMed.font={name:'Calibri',size:10}; obsMed.border=bdr;
        obsMed.alignment={wrapText:true,vertical:'top'}; ws5.getRow(r).height=50;
        ws5.columns=[{width:40},{width:22},{width:20}];
        pageFooter(ws5, 3);

        // ══════════════════════════════════════════════════════════
        // HOJA 6 — CONCLUSIONES
        // ══════════════════════════════════════════════════════════
        const ws6=workbook.addWorksheet('📝 Conclusiones');
        pageHeader(ws6,'CONCLUSIONES Y RECOMENDACIONES',2); r=4;

        secH(ws6,r++,'📋  CONCLUSIÓN DE LA VISITA',AZUL,2);
        ws6.getCell(`A${r}`).value='Descripción general / Observaciones:';
        ws6.getCell(`A${r}`).fill=fill(BLUECL); ws6.getCell(`A${r}`).font={name:'Calibri',bold:true,size:10}; ws6.getCell(`A${r}`).border=bdr;
        ws6.getRow(r).height=20; r++;
        ws6.mergeCells(`A${r}:B${r}`);
        ws6.getCell(`A${r}`).value=data.observacionesGenerales||'-';
        ws6.getCell(`A${r}`).font={name:'Calibri',size:10}; ws6.getCell(`A${r}`).border=bdr;
        ws6.getCell(`A${r}`).alignment={wrapText:true,vertical:'top'}; ws6.getRow(r).height=80; r+=2;

        ws6.getCell(`A${r}`).value='Recomendaciones:';
        ws6.getCell(`A${r}`).fill=fill(BLUECL); ws6.getCell(`A${r}`).font={name:'Calibri',bold:true,size:10}; ws6.getCell(`A${r}`).border=bdr;
        ws6.getRow(r).height=20; r++;
        ws6.mergeCells(`A${r}:B${r}`);
        ws6.getCell(`A${r}`).value=data.recomendaciones||'-';
        ws6.getCell(`A${r}`).font={name:'Calibri',size:10}; ws6.getCell(`A${r}`).border=bdr;
        ws6.getCell(`A${r}`).alignment={wrapText:true,vertical:'top'}; ws6.getRow(r).height=80; r+=2;

        secH(ws6,r++,'🏆  VIABILIDAD DEL PROYECTO',VERDE,2);
        ws6.mergeCells(`A${r}:B${r}`);
        const vC6=ws6.getCell(`A${r}`);
        vC6.value=vTxt[data.viabilidad]||(data.viabilidad||'Sin evaluar');
        vC6.fill=fill(vFill[data.viabilidad]||'FF9E9E9E');
        vC6.font={name:'Calibri',bold:true,size:18,color:{argb:data.viabilidad==='regular'?'FF000000':WHITE}};
        vC6.alignment={horizontal:'center',vertical:'middle'}; vC6.border=bdr;
        ws6.getRow(r).height=44;
        if (data.observacionesFotos) {
            r+=2;
            secH(ws6,r++,'📷  OBSERVACIONES DE FOTOGRAFÍAS',AZULM,2);
            ws6.mergeCells(`A${r}:B${r}`);
            ws6.getCell(`A${r}`).value=data.observacionesFotos;
            ws6.getCell(`A${r}`).font={name:'Calibri',size:10}; ws6.getCell(`A${r}`).border=bdr;
            ws6.getCell(`A${r}`).alignment={wrapText:true,vertical:'top'}; ws6.getRow(r).height=40;
        }
        ws6.columns=[{width:28},{width:60}];
        pageFooter(ws6, 2);

        // ══════════════════════════════════════════════════════════
        // HOJA 7 — EVIDENCIA FOTOGRÁFICA
        // ══════════════════════════════════════════════════════════
        const wsFotos=workbook.addWorksheet('📷 Fotos');
        pageHeader(wsFotos,'EVIDENCIA FOTOGRÁFICA',3);
        ['Categoría','Imagen','Descripción'].forEach((h,i)=>{
            const c=wsFotos.getRow(4).getCell(i+1); c.value=h;
            c.fill=fill(AZUL); c.font={name:'Calibri',bold:true,size:10,color:{argb:WHITE}};
            c.border=bdr; c.alignment={horizontal:'center',vertical:'middle'};
        });
        wsFotos.getRow(4).height=22;

        let fotoRow=5;
        const FOTO_H=90;
        const addFoto=(cat,desc,base64)=>{
            const fr=wsFotos.getRow(fotoRow);
            fr.getCell(1).value=cat; fr.getCell(1).fill=fill(fotoRow%2===0?BLUECL:WHITE);
            fr.getCell(1).font={name:'Calibri',bold:true,size:10}; fr.getCell(1).border=bdr;
            fr.getCell(1).alignment={horizontal:'center',vertical:'middle'};
            fr.getCell(2).border=bdr;
            fr.getCell(3).value=desc; fr.getCell(3).font={name:'Calibri',size:10}; fr.getCell(3).border=bdr;
            fr.getCell(3).alignment={vertical:'middle',wrapText:true};
            fr.height=FOTO_H;
            if (base64) {
                try {
                    const m=/^data:image\/(png|jpeg|jpg);base64,(.+)$/.exec(base64);
                    if (m) {
                        const ext=m[1]==='jpg'?'jpeg':m[1];
                        const imgId=workbook.addImage({base64,extension:ext});
                        wsFotos.addImage(imgId,{tl:{col:1.05,row:fotoRow-0.92},ext:{width:105,height:82}});
                    }
                } catch(e) {}
            }
            fotoRow++;
        };

        const fotoCats=[
            {arr:data.fotos,              cat:'📷 General',        desc:'Foto general'},
            {arr:data.fotosTecho,         cat:'🏠 Techo',          desc:'Foto del techo'},
            {arr:data.fotosTablero,       cat:'⚡ Tablero',        desc:'Foto tablero principal'},
            {arr:data.fotosTransformador, cat:'🔌 Transformador',  desc:'Foto transformador'},
            {arr:data.fotosRecibo,        cat:'🧾 Recibo',         desc:'Foto recibo de luz'},
            {arr:data.fotosArea1,         cat:'📐 Área',           desc:'Foto del área'},
            {arr:data.fotosEquipo,        cat:'🔧 Equipo medición',desc:'Foto equipo de medición'},
            {arr:data.fotosEspacioEquipos,cat:'📦 Espacio equipos',desc:'Foto espacio para equipos'}
        ];
        fotoCats.forEach(({arr,cat,desc})=>{
            if (Array.isArray(arr)&&arr.length>0) arr.forEach((f,i)=>addFoto(cat,`${desc} ${i+1}`,f));
        });

        // Brújula solar
        if (data.brujulaSolarImg&&data.brujulaSolarImg.startsWith('data:image')) {
            try {
                wsFotos.getRow(fotoRow).height=22;
                wsFotos.mergeCells(`A${fotoRow}:C${fotoRow}`);
                wsFotos.getCell(`A${fotoRow}`).value='🧭 BRÚJULA SOLAR — TRAYECTORIA DEL DÍA';
                wsFotos.getCell(`A${fotoRow}`).fill=fill(NARANJA);
                wsFotos.getCell(`A${fotoRow}`).font={name:'Calibri',bold:true,color:{argb:WHITE}};
                wsFotos.getCell(`A${fotoRow}`).alignment={horizontal:'center'};
                wsFotos.getCell(`A${fotoRow}`).border=bdr;
                fotoRow++;
                wsFotos.getRow(fotoRow).height=180;
                const bImg=workbook.addImage({base64:data.brujulaSolarImg,extension:'png'});
                wsFotos.addImage(bImg,{tl:{col:0.5,row:fotoRow-0.9},ext:{width:220,height:220}});
                fotoRow++;
            } catch(e) {}
        }

        if (fotoRow===5) {
            wsFotos.mergeCells('A5:C5');
            wsFotos.getCell('A5').value='📭 Sin fotos adjuntas';
            wsFotos.getCell('A5').alignment={horizontal:'center'}; wsFotos.getCell('A5').border=bdr;
            wsFotos.getRow(5).height=30;
        }
        wsFotos.columns=[{width:20},{width:16},{width:40}];
        pageFooter(wsFotos, 3);

        return workbook;
    }


    // ========== RECOLECTAR DATOS ==========
    function recolectarDatos() {
        const horasRespaldo = document.getElementById('horas-respaldo')?.value || '';
        const motivoSelect = document.getElementById('motivo-select')?.value || '';
        const motivoOtro = document.getElementById('motivo-otro')?.value || '';
        const motivo = motivoSelect === 'otro' ? motivoOtro : motivoSelect;

        // Resolver "Otro" en techo y obstáculos: si eligen otro/otros, usar el texto escrito
        const techoSelect = document.getElementById('tipo-techo')?.value || '';
        const techoOtro = document.getElementById('tipo-techo-otro')?.value || '';
        const tipoTechoResuelto = techoSelect === 'otro' ? techoOtro : techoSelect;
        const obstSelect = document.getElementById('tipo-obstaculos')?.value || '';
        const obstOtro = document.getElementById('tipo-obstaculos-otro')?.value || '';
        const tipoObstaculosResuelto = (obstSelect === 'otro' || obstSelect === 'otros') ? obstOtro : obstSelect;

        // Obtener datos del análisis solar
        const latEl = document.getElementById('solar-lat');
        const lngEl = document.getElementById('solar-lng');
        const accuracyEl = document.getElementById('solar-accuracy');
        const altitudeEl = document.getElementById('solar-altitude');

        const data = {
            // Datos del Cliente
            fecha: document.getElementById('fecha').value,
            hora: document.getElementById('hora').value,
            cliente: document.getElementById('empresa').value,
            email: document.getElementById('email-cliente').value,
            telefono: document.getElementById('telefono').value,
            direccion: document.getElementById('direccion').value,
            gps: document.getElementById('gps-coords').value,
            responsableVisita: document.getElementById('responsable-visita').value,
            tipoCliente: document.getElementById('tipo-cliente').value,
            clima: document.getElementById('tipo-clima')?.value || '',
            kilovatiosContratados: document.getElementById('kilovatios-contratados').value,
            horasRespaldo,
            numBaterias: document.getElementById('num-baterias')?.value || '',
            ultimoConsumoMes: document.getElementById('consumo-bimestral').value,
            consumo6Meses: document.getElementById('pago-bimestral').value,
            motivo,

            // Análisis Solar y Geolocalización
            analisisSolar: {
                coordenadas: (() => {
                    if (latEl && lngEl && latEl.textContent.trim() !== '--') {
                        const lat = (latEl.textContent.match(/([-\d.]+)/) || [])[1] || '';
                        const lng = (lngEl.textContent.match(/([-\d.]+)/) || [])[1] || '';
                        if (lat && lng) return lat + ', ' + lng;
                    }
                    return document.getElementById('gps-coords')?.value || '';
                })(),
                precisionGPS: accuracyEl ? accuracyEl.textContent : '',
                altitud: altitudeEl ? altitudeEl.textContent : '',
                // Trayectoria Solar
                amanecer: document.getElementById('sun-rise-time')?.textContent || '',
                amanecerAzimut: document.getElementById('sun-rise-azimuth')?.textContent || '',
                cenitSolar: document.getElementById('sun-noon-time')?.textContent || '',
                cenitElevacion: document.getElementById('sun-noon-elevation')?.textContent || '',
                atardecer: document.getElementById('sun-set-time')?.textContent || '',
                atardecerAzimut: document.getElementById('sun-set-azimuth')?.textContent || '',
                horasLuz: document.getElementById('sun-daylight')?.textContent || '',
                orientacionOptima: document.getElementById('sun-optimal-orientation')?.textContent || '',
                inclinacionOptima: document.getElementById('sun-optimal-tilt')?.textContent || '',
                posicionSolarActual: document.getElementById('sun-current-pos')?.textContent || ''
            },

            // Checklist
            checklist: {},
            tipoTecho: tipoTechoResuelto,
            tipoObstaculos: tipoObstaculosResuelto,
            certCargaFecha: document.getElementById('cert-carga-fecha')?.value || '',
            tipoMedidor: document.getElementById('tipo-medidor')?.value || '',
            espacioMedidorBaterias: document.getElementById('espacio-medidor-baterias')?.value || '',
            tipoAccesoTecho: (function(){
                const sel = document.getElementById('tipo-acceso-techo')?.value || '';
                return sel === 'otro' ? (document.getElementById('tipo-acceso-techo-otro')?.value || 'Otro') : sel;
            })(),
            observacionesChecklist: document.getElementById('observaciones-checklist').value,
            distanciaTableroPaneles: document.getElementById('distancia-tablero-paneles')?.value || '',
            transformadorPotencia: document.getElementById('transformador-potencia')?.value || '',
            proveedorEnergia: document.getElementById('proveedor-energia')?.value || '',
            numeroServicio: document.getElementById('numero-servicio')?.value || '',
            // Mediciones
            mediciones: {
                inclinacionTecho: '',   // se toma del Área 1 más abajo (ahora es por área)
                azimut: '',             // idem
                orientacionCardinal: '',// idem
                alturaTecho: '',        // idem
                horasSolarPico: document.getElementById('horas-solar-pico').value,
                irradiancia: document.getElementById('irradiancia').value,
                voltajeRed: document.getElementById('voltaje-red').value,
                capacidadInterruptor: document.getElementById('capacidad-interruptor').value,
                calibreAcometida: document.getElementById('calibre-acometida').value
            },
            equipoMedicion: (function(){
                const sel = Array.from(document.querySelectorAll('input[name="equipo-med"]:checked')).map(c => c.value);
                const otro = (document.getElementById('equipo-medicion-otro')?.value || '').trim();
                if (otro) sel.push(otro);
                return sel.join(', ');
            })(),
            observacionesMediciones: document.getElementById('observaciones-mediciones').value,
            // Fotos
            fotos: photos.slice(),
            fotosTecho: techoPhotos.slice(),
            fotosTablero: tableroPhotos.slice(),
            fotosTransformador: transformadorPhotos.slice(),
            fotosRecibo: reciboPhotos.slice(),
            fotosArea1: area1Photos.slice(),
            fotosEquipo: equipoPhotos.slice(),
            fotosEspacioEquipos: espacioEquiposPhotos.slice(),
            observacionesFotos: document.getElementById('observaciones-fotos').value,
            // Brújula solar (imagen del canvas)
            brujulaSolarImg: (() => {
                const canvas = document.getElementById('solar-compass');
                if (canvas) {
                    try { return canvas.toDataURL('image/png'); } catch(e) { return ''; }
                }
                return '';
            })(),
            // Conclusión
            observacionesGenerales: document.getElementById('observaciones-generales').value,
            recomendaciones: document.getElementById('recomendaciones').value,
            viabilidad: document.getElementById('viabilidad').value,
            // Metadata
            id: Date.now(),
            creadoEn: new Date().toISOString()
        };

        // Checklist radios
        document.querySelectorAll('input[type="radio"][name^="check-"]:checked').forEach(r => {
            data.checklist[r.name.replace('check-', '')] = r.value;
        });

        // Áreas disponibles dinámicas
        data.areas = [];
        const areasContainer = document.getElementById('areas-container');
        if (areasContainer) {
            areasContainer.querySelectorAll('.area-item').forEach(div => {
                const index = div.dataset.index;
                if (!index) return;
                const largo = document.getElementById(`area-${index}-largo`)?.value || '';
                const ancho = document.getElementById(`area-${index}-ancho`)?.value || '';
                const util = document.getElementById(`area-${index}-util`)?.value || '';
                const desc = document.getElementById(`area-${index}-descripcion`)?.value || '';
                data.areas.push({
                    descripcion: desc,
                    largo,
                    ancho,
                    areaUtil: util,
                    inclinacion: document.getElementById(`area-${index}-inclinacion`)?.value || '',
                    orientacionCardinal: document.getElementById(`area-${index}-orientacion`)?.value || '',
                    azimut: document.getElementById(`area-${index}-azimut`)?.value || '',
                    altura: document.getElementById(`area-${index}-altura`)?.value || ''
                });
            });
        }

        // Para compatibilidad con Excel/historial, tomar Área 1 como principal
        const area1 = data.areas[0] || {};
        data.mediciones.areaLargo = area1.largo || '';
        data.mediciones.areaAncho = area1.ancho || '';
        data.mediciones.areaUtil = area1.areaUtil || '';
        // Inclinación/orientación ahora son por área → reflejar Área 1 en mediciones (compat)
        data.mediciones.inclinacionTecho = area1.inclinacion || '';
        data.mediciones.azimut = area1.azimut || '';
        data.mediciones.orientacionCardinal = area1.orientacionCardinal || '';
        data.mediciones.alturaTecho = area1.altura || '';

        // Cálculo de Potencial Solar (mismo que el visualizador en vivo)
        data.potencialSolar = (function() {
            const consumo = parseFloat(data.ultimoConsumoMes);
            const pago    = parseFloat(data.consumo6Meses);
            const h       = parseFloat(data.mediciones.horasSolarPico);
            const mensual = !isNaN(consumo) ? consumo : (!isNaN(pago) ? pago / 6 : null);
            if (!mensual || !h || h <= 0) return null;
            const daily   = mensual / 30;
            const kwp     = daily / h / 0.85;
            const panels  = Math.ceil(kwp * 1000 / 550);
            const annual  = kwp * h * 365 * 0.85;
            let calidad;
            if      (h < 3) calidad = '🔵 Pobre';
            else if (h < 4) calidad = '🟡 Aceptable';
            else if (h < 5) calidad = '🟠 Bueno';
            else if (h < 6) calidad = '🟢 Muy Bueno';
            else            calidad = '🌟 Excelente';
            return {
                kwp: kwp.toFixed(2),
                panels: panels,
                anual: Math.round(annual),
                calidadHSP: calidad,
                consumoMensual: mensual.toFixed(0)
            };
        })();

        return data;
    }

    async function exportarTodoExcel() {
        const visitas = JSON.parse(localStorage.getItem('visitas_solar') || '[]');
        if (visitas.length === 0) { showToast('No hay visitas guardadas para exportar', 'error'); return; }

        const wb = new ExcelJS.Workbook();
        wb.creator = 'Ecowatt E.S.P · Solix SAS - Historial Visitas Técnicas Solares';
        wb.created = new Date();

        // Paleta compartida con construirWorkbookVisita
        const AZUL='FF1B2E5A', AZULM='FF2E4A80', NARANJA='FFF7941D';
        const VERDE='FF2E7D32', VERDECL='FFE8F5E9';
        const CELEST='FF00A3E0', CELESTCL='FFE1F5FE';
        const GRIS='FFF5F5F5', WHITE='FFFFFFFF';
        const ORANGECL='FFFFF3E0', BLUECL='FFE8EDF5';
        const vFill = { excelente:'FF4CAF50', bueno:'FF2196F3', regular:'FFFFC107', dificil:'FFFF9800', 'no-viable':'FFC62828' };
        const vTxt  = { excelente:'🟢 EXCELENTE', bueno:'🔵 BUENO', regular:'🟡 REGULAR', dificil:'🟠 DIFÍCIL', 'no-viable':'🔴 NO VIABLE' };

        const fill = a => ({ type:'pattern', pattern:'solid', fgColor:{argb:a} });
        const bdr  = { top:{style:'thin',color:{argb:'FFCCCCCC'}}, left:{style:'thin',color:{argb:'FFCCCCCC'}}, bottom:{style:'thin',color:{argb:'FFCCCCCC'}}, right:{style:'thin',color:{argb:'FFCCCCCC'}} };

        function pageHeader(ws, title, cols, cliente, fecha) {
            const L = String.fromCharCode(64 + cols);
            ws.mergeCells(`A1:${L}1`);
            const h = ws.getCell('A1');
            h.value = '☀️  ECOWATT E.S.P   ·   SOLIX SAS   —   ' + title;
            h.fill=fill(AZUL); h.font={name:'Calibri',bold:true,size:14,color:{argb:WHITE}};
            h.alignment={horizontal:'center',vertical:'middle'}; ws.getRow(1).height=34;
            ws.mergeCells(`A2:${L}2`);
            const s = ws.getCell('A2');
            s.value = 'Generado: ' + new Date().toLocaleString('es-CO')
                + (cliente ? '   —   Cliente: ' + cliente : '   —   Total visitas: ' + visitas.length)
                + (fecha   ? '   —   Fecha visita: ' + fecha : '');
            s.fill=fill(AZULM); s.font={name:'Calibri',size:9,italic:true,color:{argb:WHITE}};
            s.alignment={horizontal:'center'}; ws.getRow(2).height=15;
            ws.getRow(3).height=8;
        }

        function secH(ws, row, text, fillColor, cols) {
            const L = String.fromCharCode(64 + (cols||3));
            ws.mergeCells(`A${row}:${L}${row}`);
            const c = ws.getCell(`A${row}`);
            c.value=text; c.fill=fill(fillColor);
            c.font={name:'Calibri',bold:true,size:10,color:{argb:WHITE}};
            c.alignment={horizontal:'left',vertical:'middle',indent:1};
            ws.getRow(row).height=22;
        }

        function addLV(ws, row, label, value, lfill, cols) {
            cols=cols||3;
            const c1=ws.getCell(`A${row}`);
            c1.value=label; c1.fill=fill(lfill||GRIS);
            c1.font={name:'Calibri',bold:true,size:10}; c1.border=bdr;
            c1.alignment={vertical:'middle',indent:1};
            if (cols>2) ws.mergeCells(`B${row}:${String.fromCharCode(64+cols)}${row}`);
            const c2=ws.getCell(`B${row}`);
            c2.value=(value!==undefined&&value!==null&&String(value).trim()!=='')?value:'-';
            c2.font={name:'Calibri',size:10}; c2.border=bdr;
            c2.alignment={vertical:'middle',wrapText:true,indent:1};
            ws.getRow(row).height=20;
        }

        function solRow(ws, row, icon, label, value, extra) {
            const c1=ws.getCell(`A${row}`);
            c1.value=icon+'  '+label; c1.fill=fill(ORANGECL);
            c1.font={name:'Calibri',bold:true,size:10}; c1.border=bdr;
            c1.alignment={vertical:'middle',indent:1};
            const c2=ws.getCell(`B${row}`);
            c2.value=value||'-'; c2.font={name:'Calibri',bold:true,size:11,color:{argb:value?AZUL:'FF9E9E9E'}};
            c2.border=bdr; c2.alignment={horizontal:'center',vertical:'middle'};
            const c3=ws.getCell(`C${row}`);
            c3.value=extra||''; c3.font={name:'Calibri',size:9,italic:true};
            c3.border=bdr; c3.alignment={vertical:'middle'};
            ws.getRow(row).height=22;
        }

        const blank=(ws,row)=>{ ws.getRow(row).height=6; };

        // ══════════════════════════════════════════════════════════
        // HOJA 1 — RESUMEN GENERAL (tabla con todas las visitas)
        // ══════════════════════════════════════════════════════════
        const wsRes = wb.addWorksheet('📊 Resumen General');
        pageHeader(wsRes, 'HISTORIAL DE VISITAS TÉCNICAS SOLARES', 9);

        const viabs = visitas.reduce((a,v)=>{ a[v.viabilidad||'?']=(a[v.viabilidad||'?']||0)+1; return a; },{});
        let r = 4;
        const statsData = [
            ['Total de visitas', visitas.length, 'Proyectos excelentes', viabs['excelente']||0],
            ['Proyectos buenos', viabs['bueno']||0, 'Proyectos regulares', viabs['regular']||0],
            ['Clientes residenciales', visitas.filter(v=>v.tipoCliente==='residencial').length,
             'Clientes comerciales', visitas.filter(v=>v.tipoCliente==='comercial').length],
            ['Clientes industriales', visitas.filter(v=>v.tipoCliente==='industrial').length,
             'No viables', viabs['no-viable']||0],
        ];
        statsData.forEach(([l1,v1,l2,v2]) => {
            const row = wsRes.getRow(r++);
            [l1,v1,l2,v2,'','','','',''].forEach((val,i) => {
                const cell = row.getCell(i+1);
                cell.value=val; cell.border=bdr;
                if (i===0||i===2) { cell.fill=fill(BLUECL); cell.font={bold:true,size:10}; }
                else if (i===1||i===3) { cell.font={bold:true,size:11,color:{argb:AZUL}}; }
            });
            row.height=20;
        });
        wsRes.getRow(r++).height=8;

        const sumHdrs=['#','Fecha','Hora','Cliente','Tipo','Asesor','Viabilidad','Consumo (kWh)','Motivo'];
        const sumHdrRow=wsRes.getRow(r++);
        sumHdrs.forEach((h,i)=>{
            const c=sumHdrRow.getCell(i+1);
            c.value=h; c.font={name:'Calibri',bold:true,size:10,color:{argb:WHITE}};
            c.fill=fill(NARANJA); c.border=bdr; c.alignment={horizontal:'center',vertical:'middle'};
        });
        sumHdrRow.height=24;

        const vColors={excelente:'FF4CAF50',bueno:'FF1565C0',regular:'FFFFC107',dificil:'FFFF9800','no-viable':'FFC62828'};
        visitas.forEach((v,idx)=>{
            const row=wsRes.addRow([
                idx+1, v.fecha, v.hora, v.cliente,
                v.tipoCliente||'-', v.responsableVisita||'-',
                v.viabilidad||'-', v.ultimoConsumoMes||v.consumoBimestral||'-', v.motivo||'-'
            ]);
            row.eachCell({includeEmpty:true},(cell)=>{
                cell.border=bdr; cell.font={name:'Calibri',size:10};
                if (idx%2===1) cell.fill=fill(BLUECL);
                cell.alignment={vertical:'middle',wrapText:true};
            });
            row.height=18;
            if (v.viabilidad&&vColors[v.viabilidad]) {
                const vc=row.getCell(7);
                vc.font={bold:true,color:{argb:v.viabilidad==='regular'?'FF000000':WHITE},size:10};
                vc.fill=fill(vColors[v.viabilidad]);
            }
        });
        wsRes.columns=[4,11,7,22,14,18,14,14,28].map(w=>({width:w}));

        // ══════════════════════════════════════════════════════════
        // HOJAS INDIVIDUALES — una hoja card-style por visita
        // ══════════════════════════════════════════════════════════
        visitas.forEach((v, idx) => {
            const shortName = (v.cliente||'Visita').replace(/[^\w\sáéíóúñÁÉÍÓÚÑ]/g,'').trim().substring(0,18);
            const ws = wb.addWorksheet((idx+1) + ' — ' + shortName);
            let r = 4;

            pageHeader(ws, 'REPORTE DE VISITA TÉCNICA SOLAR', 3, v.cliente, v.fecha);

            secH(ws,r++,'🗓️  INFORMACIÓN DE LA VISITA',AZUL,3);
            addLV(ws,r++,'Fecha de Visita',v.fecha,BLUECL,3);
            addLV(ws,r++,'Hora de Registro',v.hora,BLUECL,3);
            addLV(ws,r++,'Asesor Responsable',v.responsableVisita,BLUECL,3);
            addLV(ws,r++,'Motivo / Interés',v.motivo,BLUECL,3);
            blank(ws,r++);

            secH(ws,r++,'👤  DATOS DEL CLIENTE',AZULM,3);
            addLV(ws,r++,'Nombre / Empresa',v.cliente,CELESTCL,3);
            addLV(ws,r++,'Tipo de Cliente',v.tipoCliente,CELESTCL,3);
            addLV(ws,r++,'Email',v.email,CELESTCL,3);
            addLV(ws,r++,'Teléfono',v.telefono,CELESTCL,3);
            addLV(ws,r++,'Dirección / Sitio',v.direccion,CELESTCL,3);
            blank(ws,r++);

            secH(ws,r++,'⚡  CONSUMO ENERGÉTICO',CELEST,3);
            addLV(ws,r++,'Último Consumo (kWh/mes)',v.ultimoConsumoMes||v.consumoBimestral,CELESTCL,3);
            addLV(ws,r++,'Consumo 6 Meses (kWh)',v.consumo6Meses||v.pagoBimestral,CELESTCL,3);
            addLV(ws,r++,'Proveedor de Energía',v.proveedorEnergia,CELESTCL,3);
            addLV(ws,r++,'Número de Servicio',v.numeroServicio,CELESTCL,3);
            addLV(ws,r++,'Tipo de Clima / Piso Térmico',climaLabel(v.clima),CELESTCL,3);
            addLV(ws,r++,'kW Contratados',v.kilovatiosContratados,CELESTCL,3);
            addLV(ws,r++,'Respaldo de Baterías (horas)',(v.horasRespaldo&&parseFloat(v.horasRespaldo)>0)?(v.horasRespaldo+' h'):'Sin baterías',CELESTCL,3);
            if (v.numBaterias) addLV(ws,r++,'Cantidad de Baterías',v.numBaterias,CELESTCL,3);
            blank(ws,r++);

            // GPS + Google Maps
            const coordStr = v.analisisSolar?.coordenadas || v.gps || '';
            const coordNums = coordStr.match(/-?\d+\.\d+/g) || [];
            const coordClean = coordNums.length>=2 ? coordNums[0]+', '+coordNums[1] : coordStr;
            const mapsUrl = coordNums.length>=2
                ? 'https://www.google.com/maps/search/?api=1&query='+coordNums[0]+','+coordNums[1]
                : null;

            secH(ws,r++,'📍  GEOLOCALIZACIÓN DEL SITIO',AZUL,3);
            {
                const cA=ws.getCell(`A${r}`);
                cA.value='Coordenadas GPS'; cA.fill=fill(CELESTCL);
                cA.font={name:'Calibri',bold:true,size:10}; cA.border=bdr; cA.alignment={vertical:'middle',indent:1};
                ws.mergeCells(`B${r}:C${r}`);
                const cB=ws.getCell(`B${r}`);
                cB.value=coordClean||'-'; cB.font={name:'Calibri',size:10}; cB.border=bdr; cB.alignment={vertical:'middle',indent:1};
                ws.getRow(r).height=20; r++;
            }
            if (mapsUrl) {
                ws.mergeCells(`A${r}:C${r}`);
                const mCell=ws.getCell(`A${r}`);
                mCell.value={text:'📍  Abrir ubicación del sitio en Google Maps  ▶',hyperlink:mapsUrl};
                mCell.fill=fill('FF1565C0');
                mCell.font={name:'Calibri',bold:true,size:11,color:{argb:WHITE},underline:true};
                mCell.alignment={horizontal:'center',vertical:'middle'};
                mCell.border={top:{style:'medium',color:{argb:'FF0D47A1'}},left:{style:'medium',color:{argb:'FF0D47A1'}},bottom:{style:'medium',color:{argb:'FF0D47A1'}},right:{style:'medium',color:{argb:'FF0D47A1'}}};
                ws.getRow(r).height=28; r++;
            }
            const sol=v.analisisSolar||{};
            solRow(ws,r++,'🎯','Precisión GPS',sol.precisionGPS,'');
            solRow(ws,r++,'🏔️','Altitud sobre nivel del mar',sol.altitud,'');
            blank(ws,r++);

            // Trayectoria solar
            secH(ws,r++,'☀️  TRAYECTORIA SOLAR DEL DÍA',NARANJA,3);
            ['Momento del Día','Hora','Azimut / Elevación'].forEach((h,i)=>{
                const c=ws.getRow(r).getCell(i+1);
                c.value=h; c.fill=fill(NARANJA); c.font={name:'Calibri',bold:true,size:10,color:{argb:WHITE}};
                c.border=bdr; c.alignment={horizontal:'center',vertical:'middle'};
            });
            ws.getRow(r).height=22; r++;
            solRow(ws,r++,'🌅','Amanecer',sol.amanecer,sol.amanecerAzimut||'');
            solRow(ws,r++,'☀️','Cénit Solar (mediodía solar)',sol.cenitSolar,sol.cenitElevacion?'Elevación: '+sol.cenitElevacion:'');
            solRow(ws,r++,'🌇','Atardecer',sol.atardecer,sol.atardecerAzimut||'');
            solRow(ws,r++,'🕐','Horas de Luz Solar',sol.horasLuz,'horas/día');
            blank(ws,r++);

            secH(ws,r++,'🔧  CONDICIONES ÓPTIMAS PARA INSTALACIÓN DE PANELES',VERDE,3);
            solRow(ws,r++,'🧭','Orientación Óptima para los Paneles',sol.orientacionOptima,'');
            solRow(ws,r++,'📐','Inclinación Óptima de los Paneles',sol.inclinacionOptima,'');
            solRow(ws,r++,'🌡️','Posición Solar al momento de la visita',sol.posicionSolarActual,'');
            blank(ws,r++);

            // Mediciones
            const med=v.mediciones||{};
            secH(ws,r++,'📏  MEDICIONES DEL SITIO',CELEST,3);
            addLV(ws,r++,'Inclinación del Techo (°)',med.inclinacionTecho,CELESTCL,3);
            addLV(ws,r++,'Azimut / Orientación (°)  —  180° = Sur',med.azimut,CELESTCL,3);
            addLV(ws,r++,'Altura del Techo (m)',med.alturaTecho,CELESTCL,3);
            addLV(ws,r++,'Horas Solar Pico (HSP)',(med.horasSolarPico||'-')+' HSP/día',CELESTCL,3);
            addLV(ws,r++,'Irradiancia Promedio',(med.irradiancia||'-')+' kWh/m²/día',CELESTCL,3);
            addLV(ws,r++,'Voltaje de Red (V)',med.voltajeRed,CELESTCL,3);
            addLV(ws,r++,'Interruptor Principal (A)',med.capacidadInterruptor,CELESTCL,3);
            addLV(ws,r++,'Calibre de Acometida',med.calibreAcometida,CELESTCL,3);
            addLV(ws,r++,'Distancia Tablero → Paneles (m)',v.distanciaTableroPaneles,CELESTCL,3);
            addLV(ws,r++,'Potencia del Transformador (kVA)',v.transformadorPotencia,CELESTCL,3);
            if (v.areas&&v.areas.length>0) {
                blank(ws,r++);
                secH(ws,r++,'📐  ÁREAS DISPONIBLES',AZULM,3);
                v.areas.forEach((a,ai)=>{
                    addLV(ws,r++,'Área '+(ai+1)+': '+(a.descripcion||'-'),
                        (a.largo&&a.ancho?a.largo+' × '+a.ancho+' m   —   Útil: '+(a.areaUtil||'-')+' m²':'-'),
                        BLUECL,3);
                });
            }
            blank(ws,r++);

            // Conclusiones
            secH(ws,r++,'📝  CONCLUSIONES',AZUL,3);
            ws.getCell(`A${r}`).value='Observaciones generales:';
            ws.getCell(`A${r}`).fill=fill(BLUECL); ws.getCell(`A${r}`).font={name:'Calibri',bold:true,size:10}; ws.getCell(`A${r}`).border=bdr;
            ws.getRow(r).height=20; r++;
            ws.mergeCells(`A${r}:C${r}`);
            ws.getCell(`A${r}`).value=v.observacionesGenerales||'-';
            ws.getCell(`A${r}`).font={name:'Calibri',size:10}; ws.getCell(`A${r}`).border=bdr;
            ws.getCell(`A${r}`).alignment={wrapText:true,vertical:'top'}; ws.getRow(r).height=60; r+=2;

            ws.getCell(`A${r}`).value='Recomendaciones:';
            ws.getCell(`A${r}`).fill=fill(BLUECL); ws.getCell(`A${r}`).font={name:'Calibri',bold:true,size:10}; ws.getCell(`A${r}`).border=bdr;
            ws.getRow(r).height=20; r++;
            ws.mergeCells(`A${r}:C${r}`);
            ws.getCell(`A${r}`).value=v.recomendaciones||'-';
            ws.getCell(`A${r}`).font={name:'Calibri',size:10}; ws.getCell(`A${r}`).border=bdr;
            ws.getCell(`A${r}`).alignment={wrapText:true,vertical:'top'}; ws.getRow(r).height=60; r+=2;

            secH(ws,r++,'🏆  VIABILIDAD DEL PROYECTO',VERDE,3);
            ws.mergeCells(`A${r}:C${r}`);
            const vCell=ws.getCell(`A${r}`);
            vCell.value=vTxt[v.viabilidad]||(v.viabilidad||'Sin evaluar');
            vCell.fill=fill(vFill[v.viabilidad]||'FF9E9E9E');
            vCell.font={name:'Calibri',bold:true,size:18,color:{argb:v.viabilidad==='regular'?'FF000000':WHITE}};
            vCell.alignment={horizontal:'center',vertical:'middle'}; vCell.border=bdr;
            ws.getRow(r).height=44;

            ws.columns=[{width:40},{width:22},{width:28}];
        });

        const fileName = 'Ecowatt_Historial_' + new Date().toISOString().split('T')[0] + '.xlsx';
        const buffer = await wb.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), fileName);
        showToast('📊 Historial descargado: ' + visitas.length + ' visitas — reporte completo por visita', 'success');

        if (window.subirAOneDrive && window.estadoOneDrive && window.estadoOneDrive().configurado) {
            await window.subirAOneDrive(buffer, fileName);
        }
    }

    // ========== GOOGLE SHEETS SYNC ==========
    function sincronizarGoogleSheets() {
        const url = localStorage.getItem('sheets-url');
        if (!url) {
            showToast('Configura la URL de Google Sheets primero', 'error');
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.getElementById('view-configuracion').classList.add('active');
            return;
        }

        const visitas = JSON.parse(localStorage.getItem('visitas_solar') || '[]');
        if (visitas.length === 0) {
            showToast('No hay visitas para sincronizar', 'error');
            return;
        }

        showToast('☁️ Sincronizando...', '');

        const datosLimpios = visitas.map(v => {
            const copia = Object.assign({}, v);
            delete copia.fotos;
            delete copia.firma;
            if (copia.checklist) {
                for (const [k, val] of Object.entries(copia.checklist)) {
                    copia['check_' + k] = val;
                }
                delete copia.checklist;
            }
            if (copia.mediciones) {
                for (const [k, val] of Object.entries(copia.mediciones)) {
                    copia['med_' + k] = val;
                }
                delete copia.mediciones;
            }
            return copia;
        });

        fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datosLimpios)
        })
            .then(() => showToast('✅ Datos enviados a Google Sheets', 'success'))
            .catch(() => showToast('Error al sincronizar', 'error'));
    }

    // ========== HISTORIAL ==========
    function renderHistorial() {
        const visitas = JSON.parse(localStorage.getItem('visitas_solar') || '[]');
        const container = document.getElementById('historial-list');

        if (visitas.length === 0) {
            container.innerHTML =
                '<div class="empty-state-pro">' +
                '  <svg class="es-illustration" viewBox="0 0 240 180" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
                '    <defs>' +
                '      <radialGradient id="esSun"><stop offset="0%" stop-color="#FFE89A"/><stop offset="60%" stop-color="#FFD449"/><stop offset="100%" stop-color="#FF9A1F"/></radialGradient>' +
                '    </defs>' +
                '    <circle cx="180" cy="42" r="22" fill="url(#esSun)" opacity="0.95"><animate attributeName="r" values="22;24;22" dur="3s" repeatCount="indefinite"/></circle>' +
                '    <g stroke="#FFD449" stroke-width="2.5" stroke-linecap="round" opacity="0.75">' +
                '      <line x1="180" y1="5"   x2="180" y2="14"/>' +
                '      <line x1="180" y1="70"  x2="180" y2="79"/>' +
                '      <line x1="143" y1="42"  x2="152" y2="42"/>' +
                '      <line x1="208" y1="42"  x2="217" y2="42"/>' +
                '      <line x1="154" y1="16"  x2="160" y2="22"/>' +
                '      <line x1="200" y1="62"  x2="206" y2="68"/>' +
                '      <line x1="154" y1="68"  x2="160" y2="62"/>' +
                '      <line x1="200" y1="22"  x2="206" y2="16"/>' +
                '    </g>' +
                '    <g>' +
                '      <polygon points="40,105 78,82 122,105 84,128" fill="#1B2E5A" stroke="#FFB347" stroke-width="1.5"/>' +
                '      <line x1="58" y1="93" x2="103" y2="116" stroke="#FFB347" stroke-width="0.8" opacity="0.55"/>' +
                '      <line x1="78" y1="82" x2="84"  y2="128" stroke="#FFB347" stroke-width="0.8" opacity="0.55"/>' +
                '      <line x1="100" y1="93" x2="62" y2="116" stroke="#FFB347" stroke-width="0.6" opacity="0.4"/>' +
                '      <polygon points="135,105 173,82 217,105 179,128" fill="#0E1B33" stroke="#FFB347" stroke-width="1.5"/>' +
                '      <line x1="153" y1="93" x2="198" y2="116" stroke="#FFB347" stroke-width="0.8" opacity="0.55"/>' +
                '      <line x1="173" y1="82" x2="179" y2="128" stroke="#FFB347" stroke-width="0.8" opacity="0.55"/>' +
                '      <line x1="195" y1="93" x2="157" y2="116" stroke="#FFB347" stroke-width="0.6" opacity="0.4"/>' +
                '    </g>' +
                '    <line x1="20" y1="155" x2="220" y2="155" stroke="#FFD449" stroke-width="1" stroke-dasharray="3,5" opacity="0.4"/>' +
                '  </svg>' +
                '  <h3>Ninguna visita registrada todavía</h3>' +
                '  <p>Tus visitas técnicas guardadas aparecerán acá con potencial estimado, ubicación, viabilidad y acceso rápido al reporte Excel.</p>' +
                '  <button class="btn btn-primary" onclick="document.querySelector(\'[data-action=nueva-visita]\').click()">Empezar primera visita →</button>' +
                '</div>';
            return;
        }

        // Calcular potencial al vuelo si no está guardado (compat con visitas viejas)
        function potencial(v) {
            if (v.potencialSolar) return v.potencialSolar;
            const consumo = parseFloat(v.ultimoConsumoMes);
            const pago    = parseFloat(v.consumo6Meses);
            const h       = parseFloat(v.mediciones?.horasSolarPico);
            const mensual = !isNaN(consumo) ? consumo : (!isNaN(pago) ? pago / 6 : null);
            if (!mensual || !h || h <= 0) return null;
            const kwp = mensual / 30 / h / 0.85;
            return {
                kwp: kwp.toFixed(2),
                panels: Math.ceil(kwp * 1000 / 550),
                anual: Math.round(kwp * h * 365 * 0.85)
            };
        }
        function hspQuality(hsp) {
            const h = parseFloat(hsp);
            if (isNaN(h)) return { label: '—', cls: 'na' };
            if (h < 3)   return { label: 'Pobre',     cls: 'low' };
            if (h < 4)   return { label: 'Aceptable', cls: 'mid' };
            if (h < 5)   return { label: 'Bueno',     cls: 'good' };
            if (h < 6)   return { label: 'Muy Bueno', cls: 'great' };
                          return { label: 'Excelente', cls: 'best' };
        }
        function coords(v) {
            const c = v.gps || v.analisisSolar?.coordenadas || '';
            const m = c.match(/-?\d+\.\d+/g);
            return m && m.length >= 2 ? m[0].slice(0,7) + ', ' + m[1].slice(0,8) : (c || '—');
        }
        const viabLabel = { excelente:'🟢 EXCELENTE', bueno:'🔵 BUENO', regular:'🟡 REGULAR', dificil:'🟠 DIFÍCIL', 'no-viable':'🔴 NO VIABLE' };

        container.innerHTML = visitas.slice().reverse().map(v => {
            const ps = potencial(v);
            const hsp = hspQuality(v.mediciones?.horasSolarPico);
            const viab = v.viabilidad || 'na';
            return (
                '<div class="historial-card" data-viab="' + viab + '">' +
                '  <div class="hc-band"></div>' +
                '  <div class="hc-body">' +
                '    <div class="hc-top">' +
                '      <div class="hc-title">' +
                '        <h4>' + (v.cliente || 'Sin nombre') + '</h4>' +
                '        <span class="hc-date">' + (v.fecha || '—') + ' · ' + (v.hora || '—') + '</span>' +
                '      </div>' +
                (v.viabilidad ? '<span class="estado-badge ' + v.viabilidad + '">' + (viabLabel[v.viabilidad] || v.viabilidad.toUpperCase()) + '</span>' : '<span class="estado-badge na">— SIN EVALUAR</span>') +
                '    </div>' +
                '    <div class="hc-meta">' +
                '      <div class="hc-meta-row"><span class="hc-meta-icon">📍</span><span>' + (v.direccion || 'Sin dirección') + '</span></div>' +
                '      <div class="hc-meta-row mono"><span class="hc-meta-icon">🛰️</span><span>' + coords(v) + '</span></div>' +
                '    </div>' +
                '    <div class="hc-stats">' +
                '      <div class="hc-stat"><span class="hc-stat-value">' + (ps ? ps.kwp : '—') + '</span><span class="hc-stat-unit">kWp</span></div>' +
                '      <div class="hc-stat"><span class="hc-stat-value">' + (ps ? ps.panels : '—') + '</span><span class="hc-stat-unit">paneles</span></div>' +
                '      <div class="hc-stat"><span class="hc-stat-value">' + (ps ? ps.anual.toLocaleString('es-CO') : '—') + '</span><span class="hc-stat-unit">kWh/año</span></div>' +
                '      <div class="hc-stat hc-hsp hsp-' + hsp.cls + '"><span class="hc-stat-value">☀ ' + (v.mediciones?.horasSolarPico || '—') + '</span><span class="hc-stat-unit">' + hsp.label + '</span></div>' +
                '    </div>' +
                '    <div class="hc-actions">' +
                '      <button class="hc-action hc-action-primary" onclick="window.appCargarVisita(' + v.id + ')">✏️ Cargar</button>' +
                '      <button class="hc-action" onclick="window.appExportarVisita(' + v.id + ')">📊 Excel</button>' +
                '      <button class="hc-action hc-action-danger" onclick="window.appEliminarVisita(' + v.id + ')">🗑️</button>' +
                '    </div>' +
                '  </div>' +
                '</div>'
            );
        }).join('');
    }

    window.appExportarVisita = function (id) {
        const visitas = JSON.parse(localStorage.getItem('visitas_solar') || '[]');
        const v = visitas.find(x => x.id === id);
        if (!v) return;

        const workbook = new ExcelJS.Workbook();
        const ws = workbook.addWorksheet('Reporte');
        ws.addRow(['REPORTE - VISITA TÉCNICA PANELES SOLARES']);
        ws.addRow(['']);
        ws.addRow(['Campo', 'Valor']);
        ws.addRow(['Fecha', v.fecha]);
        ws.addRow(['Cliente', v.cliente]);
        ws.addRow(['Dirección', v.direccion]);
        ws.addRow(['Tipo de Clima / Piso Térmico', climaLabel(v.clima)]);
        ws.addRow(['Consumo Bimestral', v.consumoBimestral + ' kWh']);
        ws.addRow(['Pago Bimestral', '$' + v.pagoBimestral]);
        ws.addRow(['Tipo de Techo', v.tipoTecho]);
        ws.addRow(['Área Útil', (v.mediciones?.areaUtil || '') + ' m²']);
        ws.addRow(['Paneles', v.mediciones?.panelesEstimados]);
        ws.addRow(['Potencia', (v.mediciones?.potenciaSistema || '') + ' kWp']);
        ws.addRow(['Generación Est.', (v.mediciones?.generacionEstimada || '') + ' kWh/mes']);
        ws.addRow(['Viabilidad', v.viabilidad]);
        ws.addRow(['Presupuesto', '$' + (v.presupuestoEstimado || '')]);
        ws.addRow(['ROI', (v.roiEstimado || '') + ' años']);
        ws.addRow(['Observaciones', v.observacionesGenerales]);
        ws.addRow(['Recomendaciones', v.recomendaciones]);
        ws.columns = [{ width: 25 }, { width: 50 }];
        const fileName = 'VisitaTecnica_' + (v.cliente || 'reporte').replace(/\s+/g, '_') + '_' + (v.fecha || new Date().toISOString().slice(0,10)) + '.xlsx';
        workbook.xlsx.writeBuffer().then(buffer => {
            saveAs(new Blob([buffer]), fileName);
        });
    };

    window.appEliminarVisita = function (id) {
        if (!confirm('¿Eliminar esta visita?')) return;
        let visitas = JSON.parse(localStorage.getItem('visitas_solar') || '[]');
        visitas = visitas.filter(x => x.id !== id);
        localStorage.setItem('visitas_solar', JSON.stringify(visitas));
        renderHistorial();
        showToast('Visita eliminada', 'success');
    };

    // ===== CARGAR VISITA EXISTENTE PARA EDICIÓN =====
    function actualizarBannerEdicion() {
        const banner = document.getElementById('edit-mode-banner');
        const idEl   = document.getElementById('edit-mode-id');
        const btnGuardar = document.getElementById('btn-guardar');
        if (!banner) return;
        if (editingVisitaId !== null) {
            banner.hidden = false;
            if (idEl) {
                const visitas = JSON.parse(localStorage.getItem('visitas_solar') || '[]');
                const idx = visitas.findIndex(v => v.id === editingVisitaId);
                idEl.textContent = idx >= 0 ? String(idx + 1).padStart(3, '0') : '---';
            }
            if (btnGuardar) btnGuardar.textContent = '💾 Actualizar Visita';
        } else {
            banner.hidden = true;
            if (btnGuardar) btnGuardar.textContent = '💾 Guardar Visita';
        }
    }

    function setVal(id, v) {
        const el = document.getElementById(id);
        if (el && v !== undefined && v !== null) {
            el.value = v;
        }
    }

    // Restaura un <select> con opción "Otro": si el valor guardado es uno conocido,
    // selecciona esa opción; si no, selecciona "otro" y rellena el campo de texto.
    function restoreSelectOrOtro(selectId, otroInputId, otroGroupId, knownValues, otroValue, saved) {
        const sel = document.getElementById(selectId);
        const inp = document.getElementById(otroInputId);
        const grp = document.getElementById(otroGroupId);
        const val = saved || '';
        if (!sel) return;
        if (knownValues.indexOf(val) !== -1) {
            sel.value = val;
            if (inp) inp.value = '';
            if (grp) grp.style.display = 'none';
        } else if (val) {
            sel.value = otroValue;
            if (inp) inp.value = val;
            if (grp) grp.style.display = '';
        } else {
            sel.value = '';
            if (grp) grp.style.display = 'none';
        }
    }

    window.appCargarVisita = function (id) {
        const visitas = JSON.parse(localStorage.getItem('visitas_solar') || '[]');
        const v = visitas.find(x => x.id === id);
        if (!v) { showToast('Visita no encontrada', 'error'); return; }

        editingVisitaId = id;

        // === Datos del Cliente ===
        setVal('fecha', v.fecha);
        setVal('hora', v.hora);
        setVal('empresa', v.cliente);
        setVal('email-cliente', v.email);
        setVal('telefono', v.telefono);
        setVal('direccion', v.direccion);
        setVal('gps-coords', v.gps);
        setVal('responsable-visita', v.responsableVisita);
        setVal('tipo-cliente', v.tipoCliente);
        setVal('tipo-clima', v.clima);
        setVal('kilovatios-contratados', v.kilovatiosContratados);
        setVal('consumo-bimestral', v.ultimoConsumoMes);
        setVal('pago-bimestral', v.consumo6Meses);

        // Horas de respaldo de baterías + cantidad
        // Compat: visitas viejas tenían requiereBaterias 'si'/'no' sin horas
        const horasResp = (v.horasRespaldo !== undefined && v.horasRespaldo !== '')
            ? v.horasRespaldo
            : (v.requiereBaterias === 'si' ? '' : '0');
        setVal('horas-respaldo', horasResp);
        setVal('num-baterias', v.numBaterias);

        // Motivo (con detección de "otro")
        const motivosKnown = ['ahorro','independencia','sostenibilidad','proyecto-nuevo','respaldo','incentivo'];
        const motivo = v.motivo || '';
        if (motivosKnown.includes(motivo)) {
            setVal('motivo-select', motivo);
            setVal('motivo-otro', '');
            const og = document.getElementById('motivo-otro-group');
            if (og) og.style.display = 'none';
        } else if (motivo) {
            setVal('motivo-select', 'otro');
            setVal('motivo-otro', motivo);
            const og = document.getElementById('motivo-otro-group');
            if (og) og.style.display = '';
        }

        // === Irradiación / mediciones ===
        const med = v.mediciones || {};
        setVal('horas-solar-pico', med.horasSolarPico);
        setVal('irradiancia', med.irradiancia);
        // Inclinación/orientación ahora son por área (se restauran en el bloque de áreas)
        setVal('voltaje-red', med.voltajeRed);
        setVal('capacidad-interruptor', med.capacidadInterruptor);
        setVal('calibre-acometida', med.calibreAcometida);
        setVal('tipo-medidor', v.tipoMedidor);
        setVal('cert-carga-fecha', v.certCargaFecha);
        setVal('espacio-medidor-baterias', v.espacioMedidorBaterias);
        // Tipo de acceso al techo (con manejo de "Otro")
        restoreSelectOrOtro('tipo-acceso-techo', 'tipo-acceso-techo-otro', 'tipo-acceso-techo-otro-group',
            ['escalera-extension','escalera-tijera','escalera-marina','escaleras-internas','acceso-directo','rampa','requiere-andamio','sin-acceso'],
            'otro', v.tipoAccesoTecho);

        // === Evaluación técnica ===
        restoreSelectOrOtro('tipo-techo', 'tipo-techo-otro', 'tipo-techo-otro-group',
            ['losa-concreto','lamina-metal','lamina-galvanizada','teja-zinc','teja-barro','domos','piso-tierra'],
            'otro', v.tipoTecho);
        restoreSelectOrOtro('tipo-obstaculos', 'tipo-obstaculos-otro', 'tipo-obstaculos-otro-group',
            ['edificacion-vecina','vegetacion','sombra-propia','sombra-vecinos','sin-obstaculos'],
            'otros', v.tipoObstaculos);
        setVal('observaciones-checklist', v.observacionesChecklist);
        setVal('distancia-tablero-paneles', v.distanciaTableroPaneles);
        setVal('transformador-potencia', v.transformadorPotencia);
        setVal('proveedor-energia', v.proveedorEnergia);
        setVal('numero-servicio', v.numeroServicio);

        // Checklist radios
        document.querySelectorAll('input[type="radio"][name^="check-"]').forEach(r => { r.checked = false; });
        if (v.checklist) {
            Object.keys(v.checklist).forEach(name => {
                const val = v.checklist[name];
                const radio = document.querySelector('input[name="check-' + name + '"][value="' + val + '"]');
                if (radio) radio.checked = true;
            });
        }

        // === Áreas dinámicas ===
        const container = document.getElementById('areas-container');
        if (container && Array.isArray(v.areas)) {
            // Eliminar áreas extra (dejar solo la 1)
            container.querySelectorAll('.area-item').forEach((div, i) => { if (i > 0) container.removeChild(div); });
            // Cargar área 1
            const a1 = v.areas[0] || {};
            setVal('area-1-descripcion', a1.descripcion);
            setVal('area-1-largo', a1.largo);
            setVal('area-1-ancho', a1.ancho);
            setVal('area-1-util', a1.areaUtil);
            setVal('area-1-inclinacion', a1.inclinacion);
            setVal('area-1-orientacion', a1.orientacionCardinal);
            setVal('area-1-azimut', a1.azimut);
            setVal('area-1-altura', a1.altura);
            // Agregar áreas adicionales
            const btnAdd = document.getElementById('btn-add-area');
            for (let i = 1; i < v.areas.length; i++) {
                if (btnAdd) btnAdd.click();
                const idx = i + 1;
                const a = v.areas[i] || {};
                setVal('area-' + idx + '-descripcion', a.descripcion);
                setVal('area-' + idx + '-largo', a.largo);
                setVal('area-' + idx + '-ancho', a.ancho);
                setVal('area-' + idx + '-util', a.areaUtil);
                setVal('area-' + idx + '-inclinacion', a.inclinacion);
                setVal('area-' + idx + '-orientacion', a.orientacionCardinal);
                setVal('area-' + idx + '-azimut', a.azimut);
                setVal('area-' + idx + '-altura', a.altura);
            }
        }

        // === Equipo de medición + observaciones ===
        // Equipo de medición (multi-select): re-marcar checkboxes según el string guardado
        (function(){
            const guardados = (v.equipoMedicion || '').split(',').map(s => s.trim()).filter(Boolean);
            const checks = document.querySelectorAll('input[name="equipo-med"]');
            const conocidos = [];
            checks.forEach(c => {
                c.checked = guardados.indexOf(c.value) !== -1;
                if (c.checked) conocidos.push(c.value);
            });
            // Lo que no coincide con un checkbox va al campo "Otro"
            const otros = guardados.filter(g => conocidos.indexOf(g) === -1);
            setVal('equipo-medicion-otro', otros.join(', '));
        })();
        setVal('observaciones-mediciones', v.observacionesMediciones);
        setVal('observaciones-fotos', v.observacionesFotos);

        // === Conclusión ===
        setVal('observaciones-generales', v.observacionesGenerales);
        setVal('recomendaciones', v.recomendaciones);
        setVal('viabilidad', v.viabilidad);

        // === Fotos (restaurar arrays + re-render) ===
        photos              = Array.isArray(v.fotos)              ? v.fotos.slice()              : [];
        techoPhotos         = Array.isArray(v.fotosTecho)         ? v.fotosTecho.slice()         : [];
        tableroPhotos       = Array.isArray(v.fotosTablero)       ? v.fotosTablero.slice()       : [];
        transformadorPhotos = Array.isArray(v.fotosTransformador) ? v.fotosTransformador.slice() : [];
        reciboPhotos        = Array.isArray(v.fotosRecibo)        ? v.fotosRecibo.slice()        : [];
        area1Photos         = Array.isArray(v.fotosArea1)         ? v.fotosArea1.slice()         : [];
        equipoPhotos        = Array.isArray(v.fotosEquipo)        ? v.fotosEquipo.slice()        : [];
        espacioEquiposPhotos = Array.isArray(v.fotosEspacioEquipos) ? v.fotosEspacioEquipos.slice() : [];
        if (typeof renderPhotos === 'function')              renderPhotos();
        if (typeof renderTechoPhotos === 'function')         renderTechoPhotos();
        if (typeof renderTableroPhotos === 'function')       renderTableroPhotos();
        if (typeof renderTransformadorPhotos === 'function') renderTransformadorPhotos();
        if (typeof renderReciboPhotos === 'function')        renderReciboPhotos();
        if (typeof renderArea1Photos === 'function')         renderArea1Photos();
        if (typeof renderEquipoPhotos === 'function')        renderEquipoPhotos();
        if (typeof renderEspacioEquiposPhotos === 'function') renderEspacioEquiposPhotos();
        if (typeof initCondicionales === 'function')         initCondicionales();

        // === Banner + navegar a Nueva Visita ===
        actualizarBannerEdicion();
        const navNueva = document.querySelector('[data-action="nueva-visita"]');
        if (navNueva) navNueva.click();
        window.scrollTo({ top: 0, behavior: 'smooth' });

        showToast('✏️ Visita cargada — modificá lo que necesites y guardá', 'success');
    };

    window.appCancelarEdicion = function () {
        editingVisitaId = null;
        actualizarBannerEdicion();
        showToast('Edición cancelada', 'success');
    };

    // ========== CONFIGURACIÓN ==========
    function initConfig() {
        // Cargar datos guardados del técnico
        const configTecnico = JSON.parse(localStorage.getItem('config_tecnico') || '{}');
        if (configTecnico.nombre) document.getElementById('config-nombre-tecnico').value = configTecnico.nombre;
        if (configTecnico.telefono) document.getElementById('config-telefono-tecnico').value = configTecnico.telefono;
        if (configTecnico.email) document.getElementById('config-email-tecnico').value = configTecnico.email;
        
        // Cargar datos guardados de la empresa
        const configEmpresa = JSON.parse(localStorage.getItem('config_empresa') || '{}');
        if (configEmpresa.nombre) document.getElementById('config-nombre-empresa').value = configEmpresa.nombre;
        if (configEmpresa.telefono) document.getElementById('config-telefono-empresa').value = configEmpresa.telefono;
        if (configEmpresa.direccion) document.getElementById('config-direccion-empresa').value = configEmpresa.direccion;
        
        // Cargar preferencias de reporte
        const configPrefs = JSON.parse(localStorage.getItem('config_preferencias') || '{}');
        if (configPrefs.incluirMapa !== undefined) document.getElementById('config-incluir-mapa').checked = configPrefs.incluirMapa;
        if (configPrefs.incluirFotos !== undefined) document.getElementById('config-incluir-fotos').checked = configPrefs.incluirFotos;
        if (configPrefs.incluirFirma !== undefined) document.getElementById('config-incluir-firma').checked = configPrefs.incluirFirma;
        
        // Auto-rellenar responsable si no hay valor
        const responsableInput = document.getElementById('responsable-visita');
        if (responsableInput && !responsableInput.value && configTecnico.nombre) {
            responsableInput.value = configTecnico.nombre;
        }

        // Guardar datos del técnico
        document.getElementById('btn-guardar-tecnico')?.addEventListener('click', () => {
            const tecnico = {
                nombre: document.getElementById('config-nombre-tecnico').value,
                telefono: document.getElementById('config-telefono-tecnico').value,
                email: document.getElementById('config-email-tecnico').value
            };
            localStorage.setItem('config_tecnico', JSON.stringify(tecnico));
            // Actualizar el campo responsable en el formulario
            if (document.getElementById('responsable-visita')) {
                document.getElementById('responsable-visita').value = tecnico.nombre;
            }
            showToast('Datos del técnico guardados ✓', 'success');
        });
        
        // Guardar datos de la empresa
        document.getElementById('btn-guardar-empresa')?.addEventListener('click', () => {
            const empresa = {
                nombre: document.getElementById('config-nombre-empresa').value,
                telefono: document.getElementById('config-telefono-empresa').value,
                direccion: document.getElementById('config-direccion-empresa').value
            };
            localStorage.setItem('config_empresa', JSON.stringify(empresa));
            showToast('Datos de empresa guardados ✓', 'success');
        });
        
        // Guardar preferencias
        document.getElementById('btn-guardar-preferencias')?.addEventListener('click', () => {
            const prefs = {
                incluirMapa: document.getElementById('config-incluir-mapa').checked,
                incluirFotos: document.getElementById('config-incluir-fotos').checked,
                incluirFirma: document.getElementById('config-incluir-firma').checked
            };
            localStorage.setItem('config_preferencias', JSON.stringify(prefs));
            showToast('Preferencias guardadas ✓', 'success');
        });

        document.getElementById('btn-borrar-todo').addEventListener('click', () => {
            if (!confirm('¿Borrar TODOS los datos? Esta acción no se puede deshacer.')) return;
            if (!confirm('¿Estás seguro?')) return;
            localStorage.removeItem('visitas_solar');
            showToast('Todos los datos fueron eliminados', 'success');
            updateConfigInfo();
        });
    }

    function updateConfigInfo() {
        const visitas = JSON.parse(localStorage.getItem('visitas_solar') || '[]');
        document.getElementById('total-visitas').textContent = visitas.length;
    }

    // ========== TOAST ==========
    function showToast(message, type) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = 'toast show' + (type ? ' ' + type : '');
        // Más tiempo para mensajes de éxito de OneDrive (4s en lugar de 3s)
        const duration = (type === 'success' && message.includes('OneDrive')) ? 4500 : 3000;
        setTimeout(() => { toast.className = 'toast'; }, duration);
    }
    // Exponer showToast globalmente para que onedrive.js pueda usarlo
    window.showToast = showToast;

    // ========== SERVICE WORKER ==========
    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js')
                .then(() => console.log('Service Worker registrado'))
                .catch(err => console.log('SW Error:', err));
        }
    }

})();
