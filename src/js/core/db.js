/**
 * Capa de persistencia Supabase — alineada al esquema del proyecto.
 * Tablas: usuarios, encuestas, preguntas, respuestas_usuarios, respuestas_detalle
 */
const SUPABASE_URL = 'https://raygaeiumarehtrsuoqe.supabase.co';
const A=sb_publishable_0gwkICgd9S;
const B=wE5G-Nz_EbYg_bWGUm0mi;
const SUPABASE_KEY = A + B;

function esArchivoLocal() {
    return window.location.protocol === 'file:';
}

let supabaseClient = null;
let errorInicializacionDb = null;

try {
    if (typeof window.supabase !== 'undefined') {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
} catch (e) {
    errorInicializacionDb = 'Error al conectar con Supabase.';
    console.error(e);
}

function dbMensajeEntorno() {
    if (!supabaseClient && typeof window.supabase === 'undefined') {
        return 'No se pudo cargar la librería de Supabase (Revisa tu conexión a internet).';
    }
    if (errorInicializacionDb) {
        return errorInicializacionDb;
    }
    return null;
}

const SESION_KEY = 'usuarioSesion';
const TABLA_DETALLE = 'respuestas_detalle';

function dbObtenerSesion() {
    try {
        const raw = localStorage.getItem(SESION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function dbGuardarSesion(usuario) {
    localStorage.setItem(SESION_KEY, JSON.stringify(usuario));
}

function dbCerrarSesion() {
    localStorage.removeItem(SESION_KEY);
}

function formatearFechaDesdeDb(valor) {
    if (!valor) return '';
    try {
        return new Date(valor).toLocaleDateString('es-ES');
    } catch {
        return '';
    }
}

function mapDetalleRespuesta(row) {
    return {
        nombreUsuario: row.nombre_usuario,
        opcionElegida: row.opcion_elegida
    };
}

function mapPreguntaFromDb(row, detalles = []) {
    const pid = String(row.id);
    return {
        id: row.id,
        texto: row.texto_pregunta,
        tipo: row.tipo_pregunta,
        opciones: row.opciones || [],
        respuestasDetalle: detalles
            .filter(d => String(d.pregunta_id) === pid)
            .map(mapDetalleRespuesta)
    };
}

function mapEncuestaFromDb(row, preguntas = [], detalles = []) {
    const eid = String(row.id);
    const preguntasEncuesta = preguntas
        .filter(p => String(p.encuesta_id) === eid)
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

    const detallesEncuesta = detalles.filter(d => String(d.encuesta_id) === eid);

    return {
        id: row.id,
        titulo: row.titulo,
        descripcion: row.descripcion || '',
        creador: row.creador_nombre,
        creadorCorreo: row.creador_correo,
        fecha: formatearFechaDesdeDb(row.creado_en),
        colorTema: row.color_tema,
        estado: row.estado || 'Activa',
        totalVotos: row.total_votos ?? 0,
        duracion: 0,
        acceso: {
            tipo: row.acceso_tipo || 'todos',
            rolesPermitidos: row.roles_permitidos || [],
            usuariosPermitidos: row.usuarios_permitidos || []
        },
        preguntas: preguntasEncuesta.map(p => mapPreguntaFromDb(p, detallesEncuesta))
    };
}

function usuarioPuedeResponder(encuesta, usuario) {
    const acceso = encuesta.acceso || {};
    const rol = (usuario.role || usuario.rol || '').toUpperCase();

    if (acceso.tipo === 'todos') return true;
    if (acceso.tipo === 'rol') {
        const roles = (acceso.rolesPermitidos || []).map(r => String(r).toUpperCase());
        return roles.includes(rol);
    }
    if (acceso.tipo === 'especifico') {
        const correo = (usuario.correo || '').toLowerCase().trim();
        return (acceso.usuariosPermitidos || []).some(
            c => String(c).toLowerCase().trim() === correo
        );
    }
    return false;
}

async function dbCargarDatosEncuestas(encuestaIds = null) {
    if (!supabaseClient && typeof window.supabase !== 'undefined') {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }

    let queryEncuestas = supabaseClient.from('encuestas').select('*').order('creado_en', { ascending: false });
    if (encuestaIds?.length) {
        queryEncuestas = queryEncuestas.in('id', encuestaIds.map(String));
    }

    const { data: encuestas, error: errEnc } = await queryEncuestas;
    if (errEnc) throw errEnc;
    if (!encuestas?.length) return [];

    const ids = encuestas.map(e => String(e.id));

    const [{ data: preguntas, error: errPre }, { data: detalles, error: errDet }] =
        await Promise.all([
            supabaseClient.from('preguntas').select('*').in('encuesta_id', ids).order('orden', { ascending: true }),
            supabaseClient.from(TABLA_DETALLE).select('*').in('encuesta_id', ids)
        ]);

    if (errPre) throw errPre;
    if (errDet) throw errDet;

    return encuestas.map(e => mapEncuestaFromDb(e, preguntas || [], detalles || []));
}

async function dbLoginUsuario(correo, clave) {
    const aviso = dbMensajeEntorno();
    if (aviso) return { ok: false, mensaje: aviso };

    if (!supabaseClient && typeof window.supabase !== 'undefined') {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }

    try {
        const correoNorm = String(correo).toLowerCase().trim();
        const { data, error } = await supabaseClient
            .from('usuarios')
            .select('id, nombre, correo, clave, rol, inicial, cuenta_activa')
            .eq('correo', correoNorm)
            .eq('clave', String(clave))
            .eq('cuenta_activa', true)
            .maybeSingle();

        if (error) {
            console.error('Error en login:', error);
            return { ok: false, mensaje: error.message || 'No se pudo consultar la base de datos.' };
        }
        
        if (!data) return { ok: false, mensaje: 'Credenciales incorrectas o cuenta pendiente de verificación.' };

        return {
            ok: true,
            usuario: {
                id: data.id,
                nombre: data.nombre,
                correo: data.correo,
                clave: data.clave,
                rol: String(data.rol || 'ESTUDIANTE').toUpperCase(),
                inicial: data.inicial || (data.nombre ? data.nombre.charAt(0).toUpperCase() : 'U')
            }
        };
    } catch (e) {
        console.error('Error en login:', e);
        return { ok: false, mensaje: 'Error de conexión.' };
    }
}

async function dbRegistrarUsuario(nombre, correo, clave, rol, correoSecundario) {
    if (!supabaseClient && typeof window.supabase !== 'undefined') {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }

    try {
        const correoNorm = String(correo).toLowerCase().trim();
        const { data: existente } = await supabaseClient
            .from('usuarios')
            .select('id')
            .eq('correo', correoNorm)
            .maybeSingle();

        if (existente) return { ok: false, error: 'Este correo ya está registrado.' };

        // CORRECCIÓN: Usando nombres unificados de columnas
        const codigoToken = Math.floor(100000 + Math.random() * 900000).toString();
        const expiracion = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        const { error } = await supabaseClient.from('usuarios').insert([{
            nombre: nombre.trim(),
            correo: correoNorm,
            clave: String(clave),
            rol: String(rol).toUpperCase(),
            inicial: nombre.trim().charAt(0).toUpperCase(),
            correo_secundario: String(correoSecundario).toLowerCase().trim(),
            codigo_verificacion: codigoToken,
            codigo_expiracion: expiracion,
            cuenta_activa: false
        }]);

        if (error) throw error;

        return { 
            ok: true,
            datosEmail: { nombre: nombre.trim(), destino: correoSecundario, codigo: codigoToken }
        };
    } catch (e) {
        console.error('Error al registrar:', e);
        return { ok: false, error: 'No se pudo crear la cuenta.' };
    }
}

async function dbActivarCuentaUsuario(correoPrincipal, codigoIngresado) {
    try {
        const correoNorm = String(correoPrincipal).toLowerCase().trim();
        const { data: usuario, error } = await supabaseClient
            .from('usuarios')
            .select('id, codigo_expiracion')
            .eq('correo', correoNorm)
            .eq('codigo_verificacion', String(codigoIngresado).trim())
            .maybeSingle();

        if (error || !usuario) return { ok: false, mensaje: 'Código incorrecto.' };
        
        if (new Date(usuario.codigo_expiracion) < new Date()) {
            return { ok: false, mensaje: 'El código ha expirado.' };
        }

        const { error: updateError } = await supabaseClient
            .from('usuarios')
            .update({ cuenta_activa: true, codigo_verificacion: null, codigo_expiracion: null })
            .eq('id', usuario.id);

        if (updateError) throw updateError;
        return { ok: true };
    } catch (e) {
        console.error(e);
        return { ok: false, mensaje: 'Error al activar.' };
    }
}

async function dbSolicitarRecuperacion(correoPrincipal) {
    try {
        const correoNorm = String(correoPrincipal).toLowerCase().trim();
        const { data: usuario, error } = await supabaseClient
            .from('usuarios')
            .select('nombre, correo, correo_secundario')
            .eq('correo', correoNorm)
            .maybeSingle();

        if (error || !usuario) return { ok: false, mensaje: 'Usuario no encontrado.' };

        const codigoToken = Math.floor(100000 + Math.random() * 900000).toString();
        const expiracion = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        const { error: updateError } = await supabaseClient
            .from('usuarios')
            .update({
                codigo_verificacion: codigoToken,
                codigo_expiracion: expiracion
            })
            .eq('correo', correoNorm);

        if (updateError) throw updateError;

        return {
            ok: true,
            datosEmail: { nombre: usuario.nombre, destino: usuario.correo_secundario, codigo: codigoToken }
        };
    } catch (e) {
        return { ok: false, mensaje: 'Error al procesar recuperación.' };
    }
}

async function dbVerificarCodigoYCambiarClave(correoPrincipal, codigoIngresado, nuevaClave) {
    try {
        const correoNorm = String(correoPrincipal).toLowerCase().trim();
        const codigoNorm = String(codigoIngresado).trim();

        const { data: usuario, error } = await supabaseClient
            .from('usuarios')
            .select('correo, codigo_expiracion')
            .eq('correo', correoNorm)
            .eq('codigo_verificacion', codigoNorm)
            .maybeSingle();

        if (error || !usuario) return { ok: false, mensaje: 'Código incorrecto.' };
        if (new Date(usuario.codigo_expiracion) < new Date()) return { ok: false, mensaje: 'Código expirado.' };

        const { error: finalError } = await supabaseClient
            .from('usuarios')
            .update({
                clave: String(nuevaClave).trim(),
                codigo_verificacion: null,
                codigo_expiracion: null
            })
            .eq('correo', correoNorm);

        if (finalError) throw finalError;
        return { ok: true };
    } catch (e) {
        return { ok: false, mensaje: 'Error al cambiar clave.' };
    }
}
window.dbReenviarCodigoActivacion = async function(correo) {
    try {
        // 1. Buscar usuario por correo y estado 'inactivo'
        const { data: usuario, error } = await supabase
            .from('usuarios')
            .select('*')
            .eq('correo', correo)
            .eq('estado', 'inactivo') // Asegúrate de que tu columna se llame 'estado'
            .single();

        if (error || !usuario) return { ok: false, mensaje: "Cuenta no encontrada o ya está activa." };

        // 2. Generar nuevo código
        const nuevoCodigo = Math.floor(100000 + Math.random() * 900000).toString();
        
        // 3. Actualizar en la base de datos
        const { error: errorUpdate } = await supabase
            .from('usuarios')
            .update({ 
                codigo_verificacion: nuevoCodigo,
                codigo_expiracion: new Date(Date.now() + 15 * 60000) // 15 minutos más
            })
            .eq('correo', correo);

        if (errorUpdate) return { ok: false, mensaje: "Error al actualizar el código." };

        return { ok: true, datosEmail: { destino: correo, codigo: nuevoCodigo } };
    } catch (e) {
        return { ok: false, mensaje: "Error interno." };
    }
};
async function dbObtenerEncuestas(usuarioActual) {
    try {
        const todas = await dbCargarDatosEncuestas();
        const rol = (usuarioActual?.rol || '').toUpperCase();
        const correoSesion = (usuarioActual?.correo || '').toLowerCase().trim();
        if (rol === 'ADMINISTRADOR') return todas;
        return todas.filter(e => (e.creadorCorreo || '').toLowerCase().trim() === correoSesion);
    } catch (e) {
        return [];
    }
}

async function dbObtenerEncuestasParaResponder(usuarioActual) {
    try {
        const todas = await dbCargarDatosEncuestas();
        const correo = (usuarioActual?.correo || '').toLowerCase().trim();
        const { data: historial } = await supabaseClient
            .from('respuestas_usuarios')
            .select('encuesta_id')
            .eq('usuario_correo', correo);
        const respondidasIds = new Set((historial || []).map(r => String(r.encuesta_id)));
        return todas.filter(e => (e.estado === 'Activa') && !respondidasIds.has(String(e.id)) && usuarioPuedeResponder(e, usuarioActual));
    } catch (e) {
        return [];
    }
}

async function dbUsuarioYaRespondio(usuarioCorreo, encuestaId) {
    const { data } = await supabaseClient
        .from('respuestas_usuarios')
        .select('id')
        .eq('usuario_correo', String(usuarioCorreo).toLowerCase().trim())
        .eq('encuesta_id', String(encuestaId))
        .maybeSingle();
    return !!data;
}

async function dbGuardarEncuesta(encuestaFinal, preguntas) {
    try {
        const { error } = await supabaseClient.from('encuestas').insert([{
            id: String(encuestaFinal.id),
            titulo: encuestaFinal.titulo,
            creador_nombre: encuestaFinal.creador,
            creador_correo: encuestaFinal.creadorCorreo,
            acceso_tipo: encuestaFinal.acceso.tipo,
            roles_permitidos: encuestaFinal.acceso.rolesPermitidos,
            usuarios_permitidos: encuestaFinal.acceso.usuariosPermitidos
        }]);
        if (error) throw error;
        const { error: errP } = await supabaseClient.from('preguntas').insert(preguntas.map(p => ({
            id: String(p.id),
            encuesta_id: String(encuestaFinal.id),
            texto_pregunta: p.texto,
            tipo_pregunta: p.tipo,
            opciones: p.opciones
        })));
        if (errP) throw errP;
        return true;
    } catch (e) {
        return false;
    }
}

async function dbEliminarEncuesta(id) {
    try {
        const { error } = await supabaseClient.from('encuestas').delete().eq('id', String(id));
        return !error;
    } catch {
        return false;
    }
}

async function dbEnviarVotos(usuarioCorreo, usuarioNombre, encuesta, respuestasMap) {
    try {
        const correo = String(usuarioCorreo).toLowerCase().trim();
        const encuestaId = String(encuesta.id);
        if (await dbUsuarioYaRespondio(correo, encuestaId)) return { ok: false, mensaje: 'Ya respondiste.' };

        await supabaseClient.from('respuestas_usuarios').insert([{ usuario_correo: correo, encuesta_id: encuestaId }]);

        for (const p of encuesta.preguntas) {
            const r = respuestasMap[p.id];
            if (r) {
                await supabaseClient.from(TABLA_DETALLE).insert([{
                    encuesta_id: encuestaId,
                    pregunta_id: String(p.id),
                    nombre_usuario: usuarioNombre,
                    opcion_elegida: Array.isArray(r) ? r.join(', ') : r
                }]);
            }
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, mensaje: 'Error al enviar.' };
    }
}

// INYECCIÓN GLOBAL
window.dbMensajeEntorno = dbMensajeEntorno;
window.dbObtenerSesion = dbObtenerSesion;
window.dbGuardarSesion = dbGuardarSesion;
window.dbCerrarSesion = dbCerrarSesion;
window.dbLoginUsuario = dbLoginUsuario;
window.dbRegistrarUsuario = dbRegistrarUsuario;
window.dbObtenerEncuestas = dbObtenerEncuestas;
window.dbObtenerEncuestasParaResponder = dbObtenerEncuestasParaResponder;
window.dbEliminarEncuesta = dbEliminarEncuesta;
window.dbEnviarVotos = dbEnviarVotos;
window.dbActivarCuentaUsuario = dbActivarCuentaUsuario;
window.dbSolicitarRecuperacion = dbSolicitarRecuperacion;
window.dbVerificarCodigoYCambiarClave = dbVerificarCodigoYCambiarClave;