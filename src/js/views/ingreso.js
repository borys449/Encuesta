/**
 * ingreso.js - Lógica de interfaz y control de usuario
 */
const { createApp } = Vue;

createApp({
    data() {
        return {
            vistaActual: 'login',
            fraseActual: '',
            listaFrases: [
                'No hay texto.',
                '¿Dormir? no gracias, prefiero programar.',
                'Hola mundo.',
                'Los lentes son parte del outfit de un programador.',
                'El que hace mas goles gana el partido.',
                'Uleam >>> cualquier universidad.',
                'Usa el poder de las encuestas con sabiduria.',
                'No respondas encuestas bajo el efecto del insomnio.',
                'Software es clave.',
                'El conocimiento es libertad.'
            ],
            error: false,
            mensajeError: '',
            verClave: false,
            remember: false,
            cargando: false,

            login: { correo: '', clave: '' },
            registro: { 
                nombre: '', 
                correo: '', 
                clave: '', 
                repetir_clave: '', 
                rol: '', 
                correoSecundario: '' 
            },
            verificar: { correo: '', codigo: '' },
            recuperar: { 
                correoPrincipal: '', 
                codigoVerificacion: '', 
                nuevaClave: '', 
                paso: 1 
            }
        };
    },

    mounted() {
        this.generarFraseAleatoria();
        setInterval(() => this.generarFraseAleatoria(), 8000);

        const avisoEntorno = window.dbMensajeEntorno ? window.dbMensajeEntorno() : null;
        if (avisoEntorno) {
            this.mensajeError = avisoEntorno;
            this.error = true;
        }

        // Inicialización EmailJS con la nueva Public Key
        emailjs.init({
            publicKey: "k2m2Uuc6Utx23_CJ0"
        });

        if (window.dbObtenerSesion && window.dbObtenerSesion()) {
            window.location.replace('HTML/Proyecto_Pagina_Principal.html');
        }

        window.history.pushState(null, null, window.location.href);
        window.onpopstate = () => window.history.go(1);
    },

    methods: {
        generarFraseAleatoria() {
            const indice = Math.floor(Math.random() * this.listaFrases.length);
            this.fraseActual = this.listaFrases[indice];
        },

        async procesarLogin() {
            this.error = false;
            if (!this.login.correo || !this.login.clave) {
                this.mensajeError = 'Por favor, rellene todos los campos.';
                this.error = true;
                return;
            }
            if (this.cargando) return;

            this.cargando = true;
            try {
                const resultado = await window.dbLoginUsuario(this.login.correo, this.login.clave);
                if (resultado.ok) {
                    window.dbGuardarSesion(resultado.usuario);
                    window.location.replace('HTML/Proyecto_Pagina_Principal.html');
                } else {
                    this.mensajeError = resultado.mensaje;
                    this.error = true;
                }
            } catch (e) {
                this.mensajeError = 'Error de conexión con la base de datos.';
                this.error = true;
            } finally {
                this.cargando = false;
            }
        },

        async procesarRegistro() {
            const A1 = 'service_';
            const B1 = '37jwmic';
            const C = A1 + B1;
            const D1 = 'template_';
            const E1 = 'yj7j8f9';
            const templateId = D1 + E1;
            const { nombre, correo, clave, repetir_clave, rol, correoSecundario } = this.registro;
            if (!nombre || !correo || !clave || !repetir_clave || !rol || !correoSecundario) {
                alert("Todos los campos son obligatorios.");
                return;
            }

            this.cargando = true;
            try {
                const resultado = await window.dbRegistrarUsuario(nombre, correo, clave, rol, correoSecundario);
                if (resultado.ok) {
                    await emailjs.send(C, templateId, {
                        nombre: resultado.datosEmail.nombre,
                        destino: resultado.datosEmail.destino,
                        codigo: resultado.datosEmail.codigo
                    }, "k2m2Uuc6Utx23_CJ0");
                    alert('Código de activación enviado a tu correo.');
                    this.verificar.correo = correo;
                    this.vistaActual = 'verificar';
                } else {
                    alert(resultado.error);
                }
            } catch (e) {
                alert("Error al intentar registrar el usuario.");
            } finally {
                this.cargando = false;
            }
        },

        async procesarVerificacion() {
            if (!this.verificar.codigo) return;
            this.cargando = true;
            const res = await window.dbActivarCuentaUsuario(this.verificar.correo, this.verificar.codigo);
            this.cargando = false;

            if (res.ok) {
                alert('¡Cuenta activada con éxito!');
                this.login.correo = this.verificar.correo;
                this.vistaActual = 'login';
            } else {
                alert(res.mensaje);
            }
        },

        async solicitarCodigoRecuperacion() {
            if (!this.recuperar.correoPrincipal) return;
            this.cargando = true;
            const res = await window.dbSolicitarRecuperacion(this.recuperar.correoPrincipal);
            this.cargando = false;

            if (res.ok) {
                try {
                    await emailjs.send(C, templateId, {
                        destino: res.datosEmail.destino,
                        codigo: res.datosEmail.codigo,
                        from_name: "Sistema de Encuestas ULEAM"
                    }, "k2m2Uuc6Utx23_CJ0");
                    alert('Código enviado a tu correo.');
                    this.recuperar.paso = 2;
                } catch (err) {
                    alert('Error al enviar el correo.');
                }
            } else {
                alert(res.mensaje);
            }
        },
        async reenviarCodigo() {
            const correo = prompt("Ingresa tu correo institucional para reenviar el código:");
            if (!correo) return;

            this.cargando = true;
            const res = await window.dbReenviarCodigoActivacion(correo);
            this.cargando = false;

            if (res.ok) {
                try {
                    await emailjs.send(C, templateId, {
                        destino: res.datosEmail.destino,
                        codigo: res.datosEmail.codigo
                    }, "k2m2Uuc6Utx23_CJ0");
                    alert("Código reenviado. Revisa tu correo.");
                    this.verificar.correo = correo;
                    this.vistaActual = 'verificar';
                } catch (e) {
                    alert("Error al enviar el email.");
                }
            } else {
                alert(res.mensaje);
            }
        },
        async procesarCambioClave() {
            const { correoPrincipal, codigoVerificacion, nuevaClave } = this.recuperar;
            this.cargando = true;
            const res = await window.dbVerificarCodigoYCambiarClave(correoPrincipal, codigoVerificacion, nuevaClave);
            this.cargando = false;

            if (res.ok) {
                alert('Contraseña actualizada correctamente.');
                this.vistaActual = 'login';
                this.recuperar = { correoPrincipal: '', codigoVerificacion: '', nuevaClave: '', paso: 1 };
            } else {
                alert(res.mensaje);
            }
        }
    }
}).mount('#app');