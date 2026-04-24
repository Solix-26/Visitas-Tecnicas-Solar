// ========================================================
// APP.JS - Visitas Técnicas para Paneles Solares
// ========================================================

(function () {
    'use strict';

    let currentStep = 1;
    let photos = [];
    let techoPhotos = [];
    let firmaCtx, firmaCanvas, firmaDibujando = false;

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
        initRemoveAreaButtons();
    }

    function initBateriasToggle() {
        const btnSi = document.getElementById('btn-baterias-si');
        const btnNo = document.getElementById('btn-baterias-no');
        const hidden = document.getElementById('requiere-baterias');
        const numGroup = document.getElementById('num-baterias-group');
        if (!btnSi || !btnNo) return;
        function select(val) {
            hidden.value = val;
            btnSi.classList.toggle('active', val === 'si');
            btnNo.classList.toggle('active', val === 'no');
            if (numGroup) numGroup.style.display = val === 'si' ? '' : 'none';
        }
        btnSi.addEventListener('click', () => select('si'));
        btnNo.addEventListener('click', () => select('no'));
    }

    function initMotivoSelect() {
        const sel = document.getElementById('motivo-select');
        const otroGroup = document.getElementById('motivo-otro-group');
        if (!sel || !otroGroup) return;
        sel.addEventListener('change', function () {
            otroGroup.style.display = this.value === 'otro' ? '' : 'none';
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
                    document.getElementById('gps-coords').value =
                        pos.coords.latitude.toFixed(6) + ', ' + pos.coords.longitude.toFixed(6);
                    btn.textContent = '📍 Obtener';
                    btn.disabled = false;
                    showToast('Ubicación obtenida ✓', 'success');
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
                visitas.push(data);
                localStorage.setItem('visitas_solar', JSON.stringify(visitas));
                showToast('Visita guardada ✓', 'success');
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
                    const fileName = 'Visita_' + (data.cliente || 'cliente').replace(/\s+/g, '_') + '_' + data.fecha + '.xlsx';
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
            const fileName = 'Visita_Solar_' + (data.cliente || 'cliente').replace(/\s+/g, '_') + '_' + data.fecha + '.xlsx';
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
        
        // Estilos comunes
        const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } };
        const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        const labelFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
        const border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        
        // ========== HOJA 1: RESUMEN ==========
        const ws1 = workbook.addWorksheet('Resumen');
        ws1.mergeCells('A1:D1');
        ws1.getCell('A1').value = '🌞 INFORME DE VISITA TÉCNICA SOLAR';
        ws1.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF1B5E20' } };
        ws1.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
        ws1.getRow(1).height = 30;
        
        ws1.mergeCells('A2:D2');
        ws1.getCell('A2').value = 'Solix SAS - Energía Solar';
        ws1.getCell('A2').alignment = { horizontal: 'center' };
        
        // Datos Generales
        let row = 4;
        ws1.mergeCells(`A${row}:D${row}`);
        ws1.getCell(`A${row}`).value = '📋 DATOS GENERALES';
        ws1.getCell(`A${row}`).fill = headerFill;
        ws1.getCell(`A${row}`).font = headerFont;
        ws1.getCell(`A${row}`).alignment = { horizontal: 'center' };
        ws1.getRow(row).height = 22;
        row++;
        
        const addRow = (label1, val1, label2, val2) => {
            const r = ws1.getRow(row);
            r.getCell(1).value = label1; r.getCell(1).fill = labelFill; r.getCell(1).font = {bold:true}; r.getCell(1).border = border;
            r.getCell(2).value = val1 || '-'; r.getCell(2).border = border;
            r.getCell(3).value = label2; r.getCell(3).fill = labelFill; r.getCell(3).font = {bold:true}; r.getCell(3).border = border;
            r.getCell(4).value = val2 || '-'; r.getCell(4).border = border;
            r.height = 20;
            row++;
        };
        
        addRow('Fecha', data.fecha, 'Hora', data.hora);
        addRow('Técnico/Asesor', data.responsableVisita, 'Cliente', data.cliente);
        addRow('Teléfono', data.telefono, 'Correo', data.email);
        addRow('Dirección', data.direccion, 'Tipo Cliente', data.tipoCliente);
        addRow('GPS', data.gps, '', '');
        
        // Consumo Energético
        row++;
        ws1.mergeCells(`A${row}:D${row}`);
        ws1.getCell(`A${row}`).value = '⚡ CONSUMO ENERGÉTICO';
        ws1.getCell(`A${row}`).fill = headerFill;
        ws1.getCell(`A${row}`).font = headerFont;
        ws1.getCell(`A${row}`).alignment = { horizontal: 'center' };
        ws1.getRow(row).height = 22;
        row++;
        
        addRow('Proveedor', data.proveedorEnergia, 'No. Servicio', data.numeroServicio);
        addRow('Tarifa CFE', data.tarifaCFE, 'kW Contratados', data.kilovatiosContratados);
        addRow('Consumo Bimestral', (data.consumoBimestral || '-') + ' kWh', 'Pago Bimestral', '$' + (data.pagoBimestral || '0'));
        addRow('Requiere Baterías', data.requiereBaterias ? 'Sí' : 'No', 'Horas Respaldo', data.horasRespaldo || 'N/A');
        
        // Motivo
        row++;
        ws1.getCell(`A${row}`).value = 'Motivo/Interés:';
        ws1.getCell(`A${row}`).fill = labelFill;
        ws1.getCell(`A${row}`).font = {bold:true};
        ws1.getCell(`A${row}`).border = border;
        ws1.mergeCells(`B${row}:D${row}`);
        ws1.getCell(`B${row}`).value = data.motivo || '-';
        ws1.getCell(`B${row}`).border = border;
        ws1.getCell(`B${row}`).alignment = { wrapText: true };
        ws1.getRow(row).height = 35;
        
        ws1.columns = [{ width: 20 }, { width: 22 }, { width: 20 }, { width: 22 }];
        
        // ========== HOJA 2: EVALUACIÓN ==========
        const ws2 = workbook.addWorksheet('Evaluación');
        ws2.mergeCells('A1:B1');
        ws2.getCell('A1').value = '🔍 EVALUACIÓN DEL SITIO';
        ws2.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1B5E20' } };
        ws2.getCell('A1').alignment = { horizontal: 'center' };
        ws2.getRow(1).height = 28;
        
        ws2.getRow(3).values = ['Elemento', 'Estado'];
        ws2.getRow(3).eachCell(c => { c.fill = headerFill; c.font = headerFont; c.border = border; c.alignment = {horizontal:'center'}; });
        ws2.getRow(3).height = 22;
        
        const checkLabels = {
            'techo-estado': '🏠 Estado del techo',
            'carga-techo': '📦 Capacidad de carga',
            'impermeabilizacion': '💧 Impermeabilización',
            'orientacion-sur': '🧭 Orientación sur',
            'sombras': '🌳 Libre de sombras',
            'espacio': '📐 Espacio disponible',
            'centro-carga': '⚡ Centro de carga',
            'medidor': '📊 Medidor bidireccional',
            'tierra': '🔌 Tierra física',
            'protecciones': '🛡️ Protecciones',
            'ruta-cable': '🔗 Ruta cableado',
            'contrato-proveedor': '📄 Contrato proveedor',
            'acceso-medidor': '🚪 Acceso medidor',
            'acceso-techo': '🪜 Acceso techo',
            'acceso-vehicular': '🚗 Acceso vehicular',
            'andamio': '🏗️ Requiere andamio'
        };
        
        const statusColors = { 'bien': 'FF4CAF50', 'regular': 'FFFFC107', 'mal': 'FFF44336', 'na': 'FF9E9E9E' };
        const statusText = { 'bien': '✅ BIEN', 'regular': '⚠️ REGULAR', 'mal': '❌ MAL', 'na': '➖ N/A' };
        
        row = 4;
        for (const [key, label] of Object.entries(checkLabels)) {
            const estado = data.checklist?.[key] || 'Sin evaluar';
            const r = ws2.getRow(row);
            r.getCell(1).value = label; r.getCell(1).fill = labelFill; r.getCell(1).border = border;
            r.getCell(2).value = statusText[estado] || '❓ ' + estado;
            r.getCell(2).border = border;
            r.getCell(2).alignment = { horizontal: 'center' };
            if (statusColors[estado]) {
                r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColors[estado] } };
                r.getCell(2).font = { bold: true, color: { argb: estado === 'regular' ? 'FF000000' : 'FFFFFFFF' } };
            }
            r.height = 20;
            row++;
        }
        
        row++;
        ws2.getCell(`A${row}`).value = 'Tipo de Techo:'; ws2.getCell(`A${row}`).fill = labelFill; ws2.getCell(`A${row}`).border = border;
        ws2.getCell(`B${row}`).value = data.tipoTecho || '-'; ws2.getCell(`B${row}`).border = border;
        row++;
        ws2.getCell(`A${row}`).value = 'Observaciones:'; ws2.getCell(`A${row}`).fill = labelFill; ws2.getCell(`A${row}`).border = border;
        ws2.getCell(`B${row}`).value = data.observacionesChecklist || '-'; ws2.getCell(`B${row}`).border = border;
        ws2.getCell(`B${row}`).alignment = { wrapText: true };
        ws2.getRow(row).height = 40;
        
        ws2.columns = [{ width: 28 }, { width: 20 }];
        
        // ========== HOJA 3: MEDICIONES SOLAR ==========
        const ws3 = workbook.addWorksheet('Mediciones Solar');
        ws3.mergeCells('A1:C1');
        ws3.getCell('A1').value = '☀️ MEDICIONES Y ANÁLISIS SOLAR';
        ws3.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1B5E20' } };
        ws3.getCell('A1').alignment = { horizontal: 'center' };
        ws3.getRow(1).height = 28;
        
        row = 3;
        
        // Análisis Solar y Geolocalización
        ws3.mergeCells(`A${row}:C${row}`);
        ws3.getCell(`A${row}`).value = '📍 ANÁLISIS SOLAR Y GEOLOCALIZACIÓN';
        ws3.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2196F3' } };
        ws3.getCell(`A${row}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        ws3.getCell(`A${row}`).alignment = { horizontal: 'center' };
        ws3.getRow(row).height = 22;
        row++;
        
        const addGeoRow = (param, valor, unidad) => {
            const r = ws3.getRow(row);
            r.getCell(1).value = param; r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } }; r.getCell(1).border = border;
            r.getCell(2).value = valor || '-'; r.getCell(2).border = border; r.getCell(2).alignment = {horizontal:'center'};
            r.getCell(3).value = unidad || ''; r.getCell(3).border = border;
            row++;
        };
        
        addGeoRow('Coordenadas', data.analisisSolar?.coordenadas || data.gps, '');
        addGeoRow('Precisión GPS', data.analisisSolar?.precisionGPS, '');
        addGeoRow('Altitud', data.analisisSolar?.altitud, '');
        
        // Trayectoria Solar
        row++;
        ws3.mergeCells(`A${row}:C${row}`);
        ws3.getCell(`A${row}`).value = '🌅 TRAYECTORIA SOLAR DEL DÍA';
        ws3.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF9800' } };
        ws3.getCell(`A${row}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        ws3.getCell(`A${row}`).alignment = { horizontal: 'center' };
        ws3.getRow(row).height = 22;
        row++;
        
        const addSolarRow = (param, valor, unidad) => {
            const r = ws3.getRow(row);
            r.getCell(1).value = param; r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } }; r.getCell(1).border = border;
            r.getCell(2).value = valor || '-'; r.getCell(2).border = border; r.getCell(2).alignment = {horizontal:'center'}; r.getCell(2).font = {bold:true};
            r.getCell(3).value = unidad || ''; r.getCell(3).border = border;
            row++;
        };
        
        addSolarRow('🌅 Amanecer', data.analisisSolar?.amanecer, data.analisisSolar?.amanecerAzimut);
        addSolarRow('☀️ Cénit Solar', data.analisisSolar?.cenitSolar, data.analisisSolar?.cenitElevacion);
        addSolarRow('🌇 Atardecer', data.analisisSolar?.atardecer, data.analisisSolar?.atardecerAzimut);
        addSolarRow('🕐 Horas de Luz', data.analisisSolar?.horasLuz, 'horas/día');
        addSolarRow('🧭 Orientación Óptima', data.analisisSolar?.orientacionOptima, '');
        addSolarRow('📐 Inclinación Óptima', data.analisisSolar?.inclinacionOptima, '');
        addSolarRow('🌡️ Posición Solar Actual', data.analisisSolar?.posicionSolarActual, '');
        
        // Áreas
        row++;
        ws3.mergeCells(`A${row}:C${row}`);
        ws3.getCell(`A${row}`).value = '📐 ÁREAS DISPONIBLES';
        ws3.getCell(`A${row}`).fill = headerFill; ws3.getCell(`A${row}`).font = headerFont;
        ws3.getCell(`A${row}`).alignment = { horizontal: 'center' };
        ws3.getRow(row).height = 22;
        row++;
        
        if (data.areas && data.areas.length > 0) {
            data.areas.forEach((area, idx) => {
                const r = ws3.getRow(row);
                r.getCell(1).value = `Área ${idx + 1}: ${area.descripcion || '-'}`; r.getCell(1).fill = labelFill; r.getCell(1).border = border;
                r.getCell(2).value = `${area.largo || '-'} x ${area.ancho || '-'} m`; r.getCell(2).border = border;
                r.getCell(3).value = `Útil: ${area.areaUtil || '-'} m²`; r.getCell(3).border = border;
                row++;
            });
        } else {
            ws3.getCell(`A${row}`).value = 'Sin áreas registradas'; ws3.getCell(`A${row}`).border = border;
            row++;
        }
        
        // Orientación
        row++;
        ws3.mergeCells(`A${row}:C${row}`);
        ws3.getCell(`A${row}`).value = '🧭 ORIENTACIÓN E INCLINACIÓN';
        ws3.getCell(`A${row}`).fill = headerFill; ws3.getCell(`A${row}`).font = headerFont;
        ws3.getCell(`A${row}`).alignment = { horizontal: 'center' };
        ws3.getRow(row).height = 22;
        row++;
        
        const addMedRow = (param, valor, unidad) => {
            const r = ws3.getRow(row);
            r.getCell(1).value = param; r.getCell(1).fill = labelFill; r.getCell(1).border = border;
            r.getCell(2).value = valor || '-'; r.getCell(2).border = border; r.getCell(2).alignment = {horizontal:'center'};
            r.getCell(3).value = unidad; r.getCell(3).border = border;
            row++;
        };
        
        addMedRow('Inclinación techo', data.mediciones?.inclinacionTecho, '°');
        addMedRow('Azimut/Orientación', data.mediciones?.azimut, '° (180=Sur)');
        addMedRow('Altura techo', data.mediciones?.alturaTecho, 'm');
        
        // Irradiación Solar
        row++;
        ws3.mergeCells(`A${row}:C${row}`);
        ws3.getCell(`A${row}`).value = '☀️ IRRADIACIÓN SOLAR';
        ws3.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF9800' } };
        ws3.getCell(`A${row}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        ws3.getCell(`A${row}`).alignment = { horizontal: 'center' };
        ws3.getRow(row).height = 22;
        row++;
        
        const r1 = ws3.getRow(row);
        r1.getCell(1).value = 'Horas Solar Pico (HSP)'; r1.getCell(1).fill = labelFill; r1.getCell(1).border = border;
        r1.getCell(2).value = data.mediciones?.horasSolarPico || '-'; r1.getCell(2).border = border; r1.getCell(2).font = {bold:true, size:12}; r1.getCell(2).alignment = {horizontal:'center'};
        r1.getCell(3).value = 'HSP/día'; r1.getCell(3).border = border;
        row++;
        
        const r2 = ws3.getRow(row);
        r2.getCell(1).value = 'Irradiancia'; r2.getCell(1).fill = labelFill; r2.getCell(1).border = border;
        r2.getCell(2).value = data.mediciones?.irradiancia || '-'; r2.getCell(2).border = border; r2.getCell(2).font = {bold:true, size:12}; r2.getCell(2).alignment = {horizontal:'center'};
        r2.getCell(3).value = 'kWh/m²/día'; r2.getCell(3).border = border;
        row++;
        
        // Eléctrico
        row++;
        ws3.mergeCells(`A${row}:C${row}`);
        ws3.getCell(`A${row}`).value = '⚡ INSTALACIÓN ELÉCTRICA';
        ws3.getCell(`A${row}`).fill = headerFill; ws3.getCell(`A${row}`).font = headerFont;
        ws3.getCell(`A${row}`).alignment = { horizontal: 'center' };
        ws3.getRow(row).height = 22;
        row++;
        
        addMedRow('Voltaje Red', data.mediciones?.voltajeRed, 'V');
        addMedRow('Interruptor Principal', data.mediciones?.capacidadInterruptor, 'A');
        addMedRow('Calibre Acometida', data.mediciones?.calibreAcometida, '');
        addMedRow('Distancia tablero→paneles', data.distanciaTableroPaneles, 'm');
        addMedRow('Potencia transformador', data.transformadorPotencia, 'kVA');
        
        row++;
        ws3.getCell(`A${row}`).value = 'Equipo Medición:'; ws3.getCell(`A${row}`).fill = labelFill; ws3.getCell(`A${row}`).border = border;
        ws3.mergeCells(`B${row}:C${row}`);
        ws3.getCell(`B${row}`).value = data.equipoMedicion || '-'; ws3.getCell(`B${row}`).border = border;
        row++;
        ws3.getCell(`A${row}`).value = 'Observaciones:'; ws3.getCell(`A${row}`).fill = labelFill; ws3.getCell(`A${row}`).border = border;
        ws3.mergeCells(`B${row}:C${row}`);
        ws3.getCell(`B${row}`).value = data.observacionesMediciones || '-'; ws3.getCell(`B${row}`).border = border;
        ws3.getCell(`B${row}`).alignment = { wrapText: true };
        ws3.getRow(row).height = 35;
        
        ws3.columns = [{ width: 26 }, { width: 16 }, { width: 16 }];
        
        // ========== HOJA 4: CONCLUSIONES ==========
        const ws4 = workbook.addWorksheet('Conclusiones');
        ws4.mergeCells('A1:B1');
        ws4.getCell('A1').value = '📝 CONCLUSIONES';
        ws4.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1B5E20' } };
        ws4.getCell('A1').alignment = { horizontal: 'center' };
        ws4.getRow(1).height = 28;
        
        const viabilidadColors = { 'excelente': 'FF4CAF50', 'bueno': 'FF2196F3', 'regular': 'FFFFC107', 'dificil': 'FFFF9800', 'no-viable': 'FFF44336' };
        const viabilidadText = { 'excelente': '🟢 EXCELENTE', 'bueno': '🔵 BUENO', 'regular': '🟡 REGULAR', 'dificil': '🟠 DIFÍCIL', 'no-viable': '🔴 NO VIABLE' };
        
        row = 3;
        ws4.getCell(`A${row}`).value = 'Viabilidad:'; ws4.getCell(`A${row}`).fill = labelFill; ws4.getCell(`A${row}`).font = {bold:true}; ws4.getCell(`A${row}`).border = border;
        ws4.getCell(`B${row}`).value = viabilidadText[data.viabilidad] || data.viabilidad || 'No evaluada';
        ws4.getCell(`B${row}`).border = border;
        if (viabilidadColors[data.viabilidad]) {
            ws4.getCell(`B${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: viabilidadColors[data.viabilidad] } };
            ws4.getCell(`B${row}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        }
        ws4.getRow(row).height = 25;
        row += 2;
        
        ws4.getCell(`A${row}`).value = 'Observaciones:'; ws4.getCell(`A${row}`).fill = labelFill; ws4.getCell(`A${row}`).border = border;
        row++;
        ws4.mergeCells(`A${row}:B${row}`);
        ws4.getCell(`A${row}`).value = data.observacionesGenerales || '-'; ws4.getCell(`A${row}`).border = border;
        ws4.getCell(`A${row}`).alignment = { wrapText: true };
        ws4.getRow(row).height = 50;
        row += 2;
        
        ws4.getCell(`A${row}`).value = 'Recomendaciones:'; ws4.getCell(`A${row}`).fill = labelFill; ws4.getCell(`A${row}`).border = border;
        row++;
        ws4.mergeCells(`A${row}:B${row}`);
        ws4.getCell(`A${row}`).value = data.recomendaciones || '-'; ws4.getCell(`A${row}`).border = border;
        ws4.getCell(`A${row}`).alignment = { wrapText: true };
        ws4.getRow(row).height = 50;
        
        ws4.columns = [{ width: 22 }, { width: 50 }];
        
        // ========== HOJA 5: FOTOS ==========
        const wsFotos = workbook.addWorksheet('Fotos');
        wsFotos.mergeCells('A1:C1');
        wsFotos.getCell('A1').value = '📷 EVIDENCIA FOTOGRÁFICA';
        wsFotos.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1B5E20' } };
        wsFotos.getCell('A1').alignment = { horizontal: 'center' };
        wsFotos.getRow(1).height = 28;
        
        wsFotos.getRow(2).values = ['Categoría', 'Foto', 'Descripción'];
        wsFotos.getRow(2).eachCell(c => { c.fill = headerFill; c.font = headerFont; c.border = border; c.alignment = {horizontal:'center'}; });
        wsFotos.getRow(2).height = 22;
        
        let fotoRow = 3;
        const FOTO_HEIGHT = 90;
        
        const addFoto = (cat, desc, base64) => {
            const r = wsFotos.getRow(fotoRow);
            r.getCell(1).value = cat; r.getCell(1).fill = labelFill; r.getCell(1).border = border; r.getCell(1).alignment = {horizontal:'center', vertical:'middle'};
            r.getCell(2).border = border;
            r.getCell(3).value = desc; r.getCell(3).border = border; r.getCell(3).alignment = {vertical:'middle', wrapText:true};
            r.height = FOTO_HEIGHT;
            
            if (base64) {
                try {
                    const match = /^data:image\/(png|jpeg|jpg);base64,(.+)$/.exec(base64);
                    if (match) {
                        const ext = match[1] === 'jpg' ? 'jpeg' : match[1];
                        const imgId = workbook.addImage({ base64: base64, extension: ext });
                        wsFotos.addImage(imgId, { tl: { col: 1.05, row: fotoRow - 0.92 }, ext: { width: 105, height: 82 } });
                    }
                } catch(e) {}
            }
            fotoRow++;
        };
        
        const cats = [
            { arr: data.fotos, cat: '📷 General', desc: 'Foto general' },
            { arr: data.fotosTecho, cat: '🏠 Techo', desc: 'Foto techo' },
            { arr: data.fotosArea1, cat: '🏞️ Área', desc: 'Foto área' },
            { arr: data.fotosTransformador, cat: '🔌 Transformador', desc: 'Foto transformador' },
            { arr: data.fotosRecibo, cat: '🧾 Recibo', desc: 'Foto recibo' }
        ];
        cats.forEach(({arr, cat, desc}) => {
            if (Array.isArray(arr) && arr.length > 0) {
                arr.forEach((f, i) => addFoto(cat, `${desc} ${i+1}`, f));
            }
        });
        
        // Agregar brújula solar como imagen
        if (data.brujulaSolarImg && data.brujulaSolarImg.startsWith('data:image')) {
            try {
                const base64 = data.brujulaSolarImg.split(',')[1];
                const imageId = workbook.addImage({
                    base64: base64,
                    extension: 'png'
                });
                
                // Encabezado para brújula
                wsFotos.getRow(fotoRow).height = 22;
                wsFotos.mergeCells(`A${fotoRow}:C${fotoRow}`);
                wsFotos.getCell(`A${fotoRow}`).value = '🧭 BRÚJULA SOLAR - TRAYECTORIA DEL DÍA';
                wsFotos.getCell(`A${fotoRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF9800' } };
                wsFotos.getCell(`A${fotoRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
                wsFotos.getCell(`A${fotoRow}`).alignment = { horizontal: 'center' };
                wsFotos.getCell(`A${fotoRow}`).border = border;
                fotoRow++;
                
                // Imagen de la brújula (más grande)
                wsFotos.getRow(fotoRow).height = 180;
                wsFotos.addImage(imageId, {
                    tl: { col: 0.5, row: fotoRow - 0.9 },
                    ext: { width: 220, height: 220 }
                });
                fotoRow++;
            } catch(e) {
                console.log('Error agregando brújula solar:', e);
            }
        }
        
        if (fotoRow === 3) {
            wsFotos.mergeCells('A3:C3');
            wsFotos.getCell('A3').value = '📭 Sin fotos adjuntas';
            wsFotos.getCell('A3').alignment = { horizontal: 'center' };
            wsFotos.getCell('A3').border = border;
            wsFotos.getRow(3).height = 30;
        }
        
        wsFotos.columns = [{ width: 18 }, { width: 16 }, { width: 35 }];

        return workbook;
    }
    // ========== RECOLECTAR DATOS ==========
    function recolectarDatos() {
        const requiereBaterias = document.getElementById('requiere-baterias')?.value || '';
        const motivoSelect = document.getElementById('motivo-select')?.value || '';
        const motivoOtro = document.getElementById('motivo-otro')?.value || '';
        const motivo = motivoSelect === 'otro' ? motivoOtro : motivoSelect;

        // Obtener datos del análisis solar
        const coordsEl = document.getElementById('solar-coords');
        const precisionEl = document.getElementById('solar-precision');
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
            tarifaCFE: document.getElementById('tarifa-cfe').value,
            kilovatiosContratados: document.getElementById('kilovatios-contratados').value,
            requiereBaterias,
            numBaterias: requiereBaterias === 'si' ? (document.getElementById('num-baterias')?.value || '') : '',
            ultimoConsumoMes: document.getElementById('consumo-bimestral').value,
            consumo6Meses: document.getElementById('pago-bimestral').value,
            motivo,

            // Análisis Solar y Geolocalización
            analisisSolar: {
                coordenadas: coordsEl ? coordsEl.textContent : '',
                precisionGPS: precisionEl ? precisionEl.textContent : '',
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
            tipoTecho: document.getElementById('tipo-techo').value,
            tipoObstaculos: document.getElementById('tipo-obstaculos')?.value || '',
            observacionesChecklist: document.getElementById('observaciones-checklist').value,
            distanciaTableroPaneles: document.getElementById('distancia-tablero-paneles')?.value || '',
            transformadorPotencia: document.getElementById('transformador-potencia')?.value || '',
            proveedorEnergia: document.getElementById('proveedor-energia')?.value || '',
            numeroServicio: document.getElementById('numero-servicio')?.value || '',
            // Mediciones
            mediciones: {
                inclinacionTecho: document.getElementById('inclinacion-techo').value,
                azimut: document.getElementById('azimut').value,
                alturaTecho: document.getElementById('altura-techo').value,
                horasSolarPico: document.getElementById('horas-solar-pico').value,
                irradiancia: document.getElementById('irradiancia').value,
                voltajeRed: document.getElementById('voltaje-red').value,
                capacidadInterruptor: document.getElementById('capacidad-interruptor').value,
                calibreAcometida: document.getElementById('calibre-acometida').value
            },
            equipoMedicion: document.getElementById('equipo-medicion').value,
            observacionesMediciones: document.getElementById('observaciones-mediciones').value,
            // Fotos
            fotos: photos.slice(),
            fotosTecho: techoPhotos.slice(),
            fotosTablero: tableroPhotos.slice(),
            fotosTransformador: transformadorPhotos.slice(),
            fotosRecibo: reciboPhotos.slice(),
            fotosArea1: area1Photos.slice(),
            fotosEquipo: equipoPhotos.slice(),
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
                    areaUtil: util
                });
            });
        }

        // Para compatibilidad con Excel/historial, tomar Área 1 como principal
        const area1 = data.areas[0] || {};
        data.mediciones.areaLargo = area1.largo || '';
        data.mediciones.areaAncho = area1.ancho || '';
        data.mediciones.areaUtil = area1.areaUtil || '';

        return data;
    }

    async function exportarTodoExcel() {
        const visitas = JSON.parse(localStorage.getItem('visitas_solar') || '[]');
        if (visitas.length === 0) { showToast('No hay visitas guardadas para exportar', 'error'); return; }

        const wb = new ExcelJS.Workbook();
        wb.creator = 'Ecowatt E.S.P - Visita Técnica Solar';
        wb.created = new Date();

        const C = { azul: '1B2E5A', azulMed: '2E4A80', naranja: 'F7941D', verde: '2E7D32',
                    amarillo: 'F9A825', rojo: 'C62828', celeste: '00A3E0',
                    lightBlue: 'E8EDF5', lightOrange: 'FFF3E0', lightGreen: 'E8F5E9',
                    white: 'FFFFFF', gris: 'F5F5F5' };

        const fill  = c => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + c } });
        const fBlue = fill(C.azul);
        const fOrange = fill(C.naranja);
        const fGreen = fill(C.verde);
        const fLightBlue = fill(C.lightBlue);
        const fGray = fill(C.gris);
        const wFont = { name: 'Calibri', color: { argb: 'FFFFFFFF' }, bold: true, size: 11 };
        const bdr = { top:{style:'thin',color:{argb:'FFCCCCCC'}}, left:{style:'thin',color:{argb:'FFCCCCCC'}},
                      bottom:{style:'thin',color:{argb:'FFCCCCCC'}}, right:{style:'thin',color:{argb:'FFCCCCCC'}} };

        const addTitleRow = (ws, cols, text, fillColor) => {
            ws.mergeCells('A1:' + String.fromCharCode(64 + cols) + '1');
            const c = ws.getCell('A1');
            c.value = text; c.font = { ...wFont, size: 13 };
            c.fill = fill(fillColor); c.alignment = { horizontal:'center', vertical:'middle' };
            ws.getRow(1).height = 32;
            ws.mergeCells('A2:' + String.fromCharCode(64 + cols) + '2');
            const c2 = ws.getCell('A2');
            c2.value = 'Generado: ' + new Date().toLocaleString('es-CO') + '  —  Total visitas: ' + visitas.length;
            c2.font = { name:'Calibri', size:9, italic:true, color:{argb:'FFFFFFFF'} };
            c2.fill = fill(C.azulMed); c2.alignment = { horizontal:'center' };
            ws.getRow(2).height = 16;
        };

        const addHeaderRow = (ws, rowN, headers, fillColor) => {
            const row = ws.getRow(rowN);
            headers.forEach((h, i) => {
                const cell = row.getCell(i + 1);
                cell.value = h; cell.font = wFont; cell.fill = fill(fillColor);
                cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
                cell.border = bdr;
            });
            row.height = 24;
        };

        const styleDataRow = (row, even) => {
            row.eachCell({ includeEmpty:true }, cell => {
                cell.border = bdr;
                cell.font = { name:'Calibri', size:10 };
                if (even) cell.fill = fLightBlue;
                cell.alignment = { vertical:'middle', wrapText:true };
            });
            row.height = 18;
        };

        // ========== HOJA 1: RESUMEN GENERAL ==========
        const ws1 = wb.addWorksheet('📊 Resumen General');
        addTitleRow(ws1, 9, '☀️ ECOWATT E.S.P — HISTORIAL DE VISITAS TÉCNICAS SOLARES', C.azul);

        // Stats block
        const viabs = visitas.reduce((a, v) => { a[v.viabilidad||'?'] = (a[v.viabilidad||'?']||0)+1; return a; }, {});
        const statsData = [
            ['Total de visitas', visitas.length, 'Proyectos excelentes', viabs['excelente']||0],
            ['Proyectos buenos', viabs['bueno']||0, 'Proyectos regulares', viabs['regular']||0],
            ['Clientes residenciales', visitas.filter(v=>v.tipoCliente==='residencial').length,
             'Clientes comerciales', visitas.filter(v=>v.tipoCliente==='comercial').length],
            ['Clientes industriales', visitas.filter(v=>v.tipoCliente==='industrial').length,
             'No viables', viabs['no-viable']||0],
        ];
        ws1.getRow(3).height = 8;
        let r = 4;
        statsData.forEach(([l1,v1,l2,v2]) => {
            const row = ws1.getRow(r++);
            [l1,v1,l2,v2,'','','','',''].forEach((val,i) => {
                const cell = row.getCell(i+1);
                cell.value = val; cell.border = bdr;
                if (i===0||i===2) { cell.fill=fLightBlue; cell.font={bold:true,size:10}; }
                else if (i===1||i===3) { cell.font={bold:true,size:11,color:{argb:'FF'+C.azul}}; }
            });
            row.height = 20;
        });

        ws1.getRow(r++).height = 8;
        addHeaderRow(ws1, r++, ['#','Fecha','Hora','Cliente','Tipo','Asesor','Viabilidad','Último Consumo (kWh)','Motivo'], C.naranja);

        const vColors = { excelente:C.verde, bueno:'1565C0', regular:C.amarillo, dificil:'E65100', 'no-viable':C.rojo };
        visitas.forEach((v, idx) => {
            const row = ws1.addRow([
                idx+1, v.fecha, v.hora, v.cliente,
                v.tipoCliente||'-', v.responsableVisita||'-',
                v.viabilidad||'-',
                v.ultimoConsumoMes || v.consumoBimestral || '-',
                v.motivo||'-'
            ]);
            styleDataRow(row, idx%2===1);
            if (v.viabilidad && vColors[v.viabilidad]) {
                row.getCell(7).font = { bold:true, color:{argb:'FF'+vColors[v.viabilidad]}, size:10 };
                if (v.viabilidad==='regular') row.getCell(7).font = { bold:true, color:{argb:'FF000000'}, size:10 };
            }
        });
        ws1.columns = [{w:4},{w:11},{w:7},{w:22},{w:14},{w:18},{w:14},{w:14},{w:28}].map(o=>({width:o.w}));

        // ========== HOJA 2: DATOS COMPLETOS DE CLIENTES ==========
        const ws2 = wb.addWorksheet('👤 Datos Clientes');
        addTitleRow(ws2, 14, '👤 DATOS COMPLETOS DE CLIENTES Y SITIOS', C.azul);
        ws2.getRow(3).height = 8;
        addHeaderRow(ws2, 4, [
            'Fecha','Cliente','Email','Teléfono','Tipo Cliente','Dirección','GPS',
            'Asesor','Proveedor Energía','No. Servicio','Tarifa CFE','kW Contratados',
            'Req. Baterías','Num Baterías','Último Consumo (kWh)','Consumo 6 Meses (kWh)','Motivo/Interés'
        ], C.azul);
        visitas.forEach((v,idx) => {
            const row = ws2.addRow([
                v.fecha, v.cliente, v.email, v.telefono,
                v.tipoCliente||'-', v.direccion, v.gps,
                v.responsableVisita||'-', v.proveedorEnergia||'-', v.numeroServicio||'-',
                v.tarifaCFE||'-', v.kilovatiosContratados||'-',
                v.requiereBaterias==='si'?'Sí':v.requiereBaterias==='no'?'No':'-',
                v.numBaterias||'-',
                v.ultimoConsumoMes||v.consumoBimestral||'-',
                v.consumo6Meses||v.pagoBimestral||'-',
                v.motivo||'-'
            ]);
            styleDataRow(row, idx%2===1);
        });
        ws2.columns = [11,22,22,14,14,24,20,18,18,16,10,10,10,10,14,14,28].map(w=>({width:w}));

        // ========== HOJA 3: EVALUACIÓN TÉCNICA ==========
        const ws3 = wb.addWorksheet('✅ Evaluación Técnica');
        addTitleRow(ws3, 19, '✅ EVALUACIÓN TÉCNICA DEL SITIO', C.verde);
        ws3.getRow(3).height = 8;
        const checkNames = ['techo-estado','carga-techo','impermeabilizacion','orientacion-sur',
            'sombras','espacio','centro-carga','medidor','tierra','protecciones','ruta-cable',
            'contrato-proveedor','acceso-medidor','acceso-techo','acceso-vehicular','andamio'];
        const checkLabels2 = ['Estado techo','Capacidad carga','Impermeabilización','Orientación sur',
            'Libre sombras','Espacio disponible','Centro carga/tablero','Medidor bidireccional',
            'Tierra física','Protecciones','Ruta cableado','Contrato proveedor',
            'Acceso medidor','Acceso techo','Acceso vehicular','Andamio'];
        addHeaderRow(ws3, 4, ['Fecha','Cliente',...checkLabels2,'Tipo Obstáculos','Observaciones','Tipo Techo','Dist.Tablero-Paneles(m)'], C.verde);
        const stTxt = { bien:'✅ BIEN', regular:'⚠️ REGULAR', mal:'❌ MAL', na:'➖ N/A', si:'Sí', no:'No' };
        visitas.forEach((v,idx) => {
            const checks = checkNames.map(k => stTxt[v.checklist?.[k]] || '-');
            const row = ws3.addRow([v.fecha, v.cliente, ...checks,
                v.tipoObstaculos||'-', v.observacionesChecklist||'-',
                v.tipoTecho||'-', v.distanciaTableroPaneles||'-']);
            styleDataRow(row, idx%2===1);
        });
        ws3.columns = [11,22,...checkNames.map(()=>({width:10})).map(o=>o.width),16,28,14,14].map(w=>({width:w}));

        // ========== HOJA 4: MEDICIONES ==========
        const ws4 = wb.addWorksheet('📏 Mediciones');
        addTitleRow(ws4, 14, '📏 MEDICIONES Y DATOS TÉCNICOS', C.celeste);
        ws4.getRow(3).height = 8;
        addHeaderRow(ws4, 4, [
            'Fecha','Cliente','Inclinación Techo (°)','Azimut (°)','Altura Techo (m)',
            'HSP','Irradiancia (kWh/m²/día)','Voltaje Red (V)','Interruptor (A)',
            'Calibre Acometida','Transformador (kVA)','GPS','Equipo Medición',
            'Área 1 - Descripción','Área 1 - Largo (m)','Área 1 - Ancho (m)','Área 1 - Útil (m²)'
        ], C.celeste);
        visitas.forEach((v,idx) => {
            const a1 = v.areas?.[0] || {};
            const row = ws4.addRow([
                v.fecha, v.cliente,
                v.mediciones?.inclinacionTecho||'-', v.mediciones?.azimut||'-',
                v.mediciones?.alturaTecho||'-', v.mediciones?.horasSolarPico||'-',
                v.mediciones?.irradiancia||'-', v.mediciones?.voltajeRed||'-',
                v.mediciones?.capacidadInterruptor||'-', v.mediciones?.calibreAcometida||'-',
                v.transformadorPotencia||'-', v.gps||'-', v.equipoMedicion||'-',
                a1.descripcion||'-', a1.largo||'-', a1.ancho||'-', a1.areaUtil||'-'
            ]);
            styleDataRow(row, idx%2===1);
        });
        ws4.columns = [11,22,12,10,10,8,14,10,10,14,12,20,22,20,10,10,10].map(w=>({width:w}));

        // ========== HOJA 5: ANÁLISIS SOLAR ==========
        const ws5 = wb.addWorksheet('☀️ Análisis Solar');
        addTitleRow(ws5, 10, '☀️ ANÁLISIS SOLAR Y TRAYECTORIA', C.naranja);
        ws5.getRow(3).height = 8;
        addHeaderRow(ws5, 4, [
            'Fecha','Cliente','Amanecer','Az.Amanecer','Cénit Solar','Elevación Cénit',
            'Atardecer','Az.Atardecer','Horas de Luz','Orientación Óptima','Inclinación Óptima'
        ], C.naranja);
        visitas.forEach((v,idx) => {
            const s = v.analisisSolar || {};
            const row = ws5.addRow([
                v.fecha, v.cliente,
                s.amanecer||'-', s.amanecerAzimut||'-',
                s.cenitSolar||'-', s.cenitElevacion||'-',
                s.atardecer||'-', s.atardecerAzimut||'-',
                s.horasLuz||'-', s.orientacionOptima||'-', s.inclinacionOptima||'-'
            ]);
            styleDataRow(row, idx%2===1);
        });
        ws5.columns = [11,22,10,12,10,14,10,12,10,20,14].map(w=>({width:w}));

        // ========== HOJA 6: CONCLUSIONES ==========
        const ws6 = wb.addWorksheet('📝 Conclusiones');
        addTitleRow(ws6, 6, '📝 CONCLUSIONES Y RECOMENDACIONES', C.azul);
        ws6.getRow(3).height = 8;
        addHeaderRow(ws6, 4, ['Fecha','Cliente','Asesor','Viabilidad','Observaciones Generales','Recomendaciones'], C.azul);
        visitas.forEach((v,idx) => {
            const row = ws6.addRow([
                v.fecha, v.cliente, v.responsableVisita||'-',
                v.viabilidad||'-',
                v.observacionesGenerales||'-', v.recomendaciones||'-'
            ]);
            styleDataRow(row, idx%2===1);
            if (v.viabilidad && vColors[v.viabilidad]) {
                const vCell = row.getCell(4);
                vCell.font = { bold:true, color:{argb:'FF'+(v.viabilidad==='regular'?'000000':vColors[v.viabilidad])}, size:10 };
            }
        });
        ws6.columns = [11,22,18,14,42,42].map(w=>({width:w}));

        const fileName = 'Ecowatt_Historial_' + new Date().toISOString().split('T')[0] + '.xlsx';
        const buffer = await wb.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), fileName);
        showToast('📊 Excel completo descargado: ' + visitas.length + ' visitas — 6 hojas', 'success');

        // Subir a OneDrive si está configurado
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
            container.innerHTML = '<p class="empty-state">No hay visitas guardadas</p>';
            return;
        }

        container.innerHTML = visitas.slice().reverse().map(v =>
            '<div class="historial-card">' +
            '  <div class="historial-card-info">' +
            '    <h4>☀️ ' + (v.cliente || 'Sin nombre') + '</h4>' +
            '    <p>📅 ' + v.fecha + ' ' + v.hora + '</p>' +
            '    <p>📍 ' + (v.direccion || 'Sin dirección') + '</p>' +
            (v.mediciones?.potenciaSistema ? '    <p>⚡ ' + v.mediciones.potenciaSistema + ' kWp - ' + (v.mediciones.panelesEstimados || '?') + ' paneles</p>' : '') +
            (v.viabilidad ? '    <span class="estado-badge ' + v.viabilidad + '">' + v.viabilidad.toUpperCase().replace('-', ' ') + '</span>' : '') +
            '  </div>' +
            '  <div class="historial-card-actions">' +
            '    <button class="btn btn-primary btn-small" onclick="window.appExportarVisita(' + v.id + ')">📊</button>' +
            '    <button class="btn btn-danger btn-small" onclick="window.appEliminarVisita(' + v.id + ')">🗑️</button>' +
            '  </div>' +
            '</div>'
        ).join('');
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
        ws.addRow(['Tarifa CFE', v.tarifaCFE]);
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
        const fileName = 'Visita_Solar_' + (v.cliente || 'reporte').replace(/\s+/g, '_') + '_' + v.fecha + '.xlsx';
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
        setTimeout(() => { toast.className = 'toast'; }, 3000);
    }

    // ========== SERVICE WORKER ==========
    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js')
                .then(() => console.log('Service Worker registrado'))
                .catch(err => console.log('SW Error:', err));
        }
    }

})();
