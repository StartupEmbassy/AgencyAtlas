"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
exports.createUser = createUser;
exports.getUserByTelegramId = getUserByTelegramId;
exports.updateUserStatus = updateUserStatus;
exports.createRealEstate = createRealEstate;
exports.getRealEstatesByUserId = getRealEstatesByUserId;
exports.updateRealEstate = updateRealEstate;
exports.deleteRealEstate = deleteRealEstate;
exports.getAdmins = getAdmins;
exports.uploadPhoto = uploadPhoto;
exports.createListing = createListing;
exports.createRealEstateContactInfo = createRealEstateContactInfo;
const index_1 = require("@supabase/supabase-js/dist/main/index");
const grammy_1 = require("grammy");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const cross_fetch_1 = __importDefault(require("cross-fetch"));
// Cargar variables de entorno
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../../.env') });
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY || !process.env.BOT_TOKEN) {
    throw new Error('Las credenciales de Supabase y BOT_TOKEN son requeridas');
}
// Crear instancia del bot para notificaciones
const notificationBot = new grammy_1.Bot(process.env.BOT_TOKEN);
// Crear el cliente de Supabase con opciones adicionales
exports.supabase = (0, index_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: false
    },
    global: {
        fetch: cross_fetch_1.default
    }
});
// Funciones de usuario
async function createUser(telegramId, username) {
    try {
        const { data, error } = await exports.supabase
            .from('users')
            .insert([
            {
                telegram_id: telegramId,
                username: username,
                role: 'user',
                status: 'pending'
            }
        ])
            .select()
            .single();
        if (error)
            throw error;
        return data;
    }
    catch (error) {
        console.error('Error creating user:', error);
        return null;
    }
}
async function getUserByTelegramId(telegram_id, username) {
    try {
        const { data, error } = await exports.supabase
            .from('users')
            .select('*')
            .eq('telegram_id', telegram_id)
            .single();
        if (error) {
            if (error.code === 'PGRST116') {
                // Usuario no encontrado, crearlo como pendiente
                const { data: newUser, error: createError } = await exports.supabase
                    .from('users')
                    .insert([{
                        telegram_id,
                        username: username || telegram_id, // Usar el username o el ID como fallback
                        role: 'user',
                        status: 'pending',
                        created_at: new Date().toISOString()
                    }])
                    .select()
                    .single();
                if (createError) {
                    console.error('Error creating new user:', createError);
                    return null;
                }
                // Notificar a los administradores con más información
                const userInfo = username ? `@${username} (ID: ${telegram_id})` : `ID: ${telegram_id}`;
                notifyAdmins(`🆕 Nuevo usuario pendiente de aprobación:\n${userInfo}`);
                return newUser;
            }
            console.error('Error getting user:', error);
            return null;
        }
        return data;
    }
    catch (error) {
        console.error('Error in getUserByTelegramId:', error);
        return null;
    }
}
async function notifyAdmins(message) {
    try {
        const { data: admins } = await exports.supabase
            .from('users')
            .select('telegram_id')
            .eq('role', 'admin');
        if (admins && admins.length > 0) {
            for (const admin of admins) {
                try {
                    // Extraer el telegram_id del mensaje
                    const idMatch = message.match(/ID: (\d+)/);
                    const userId = idMatch ? idMatch[1] : null;
                    if (userId) {
                        const keyboard = {
                            inline_keyboard: [
                                [
                                    { text: "✅ Aprobar", callback_data: `approve_${userId}` },
                                    { text: "❌ Rechazar", callback_data: `reject_${userId}` }
                                ],
                                [
                                    { text: "⏳ Decidir más tarde", callback_data: `later_${userId}` }
                                ]
                            ]
                        };
                        await notificationBot.api.sendMessage(admin.telegram_id, message, {
                            reply_markup: keyboard
                        });
                    }
                    else {
                        await notificationBot.api.sendMessage(admin.telegram_id, message);
                    }
                }
                catch (error) {
                    console.error(`Error sending notification to admin ${admin.telegram_id}:`, error);
                }
            }
        }
        else {
            console.warn('No admins found to notify');
        }
    }
    catch (error) {
        console.error('Error notifying admins:', error);
    }
}
async function updateUserStatus(telegramId, status) {
    try {
        const { error } = await exports.supabase
            .from('users')
            .update({ status })
            .eq('telegram_id', telegramId);
        if (error)
            throw error;
        return true;
    }
    catch (error) {
        console.error('Error updating user status:', error);
        return false;
    }
}
// Funciones de inmobiliarias
async function createRealEstate(data) {
    try {
        const { data: realEstate, error } = await exports.supabase
            .from('real_estates')
            .insert([data])
            .select()
            .single();
        if (error)
            throw error;
        return realEstate;
    }
    catch (error) {
        console.error('Error al crear inmobiliaria:', error);
        return null;
    }
}
async function getRealEstatesByUserId(userId) {
    try {
        const { data, error } = await exports.supabase
            .from('real_estates')
            .select('*')
            .eq('user_id', userId);
        if (error)
            throw error;
        return data || [];
    }
    catch (error) {
        console.error('Error getting real estates:', error);
        return [];
    }
}
// Función para actualizar inmobiliaria
async function updateRealEstate(id, userId, data) {
    try {
        const { data: updatedRealEstate, error } = await exports.supabase
            .from('real_estates')
            .update({ ...data, updated_by: userId })
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw error;
        return updatedRealEstate;
    }
    catch (error) {
        console.error('Error updating real estate:', error);
        return null;
    }
}
// Función para soft delete de inmobiliaria
async function deleteRealEstate(id, userId) {
    try {
        const { error } = await exports.supabase
            .from('real_estates')
            .update({
            is_active: false,
            updated_by: userId
        })
            .eq('id', id);
        if (error)
            throw error;
        return true;
    }
    catch (error) {
        console.error('Error deleting real estate:', error);
        return false;
    }
}
// Función para obtener todos los administradores
async function getAdmins() {
    try {
        const { data, error } = await exports.supabase
            .from('users')
            .select('*')
            .eq('role', 'admin');
        if (error)
            throw error;
        return data || [];
    }
    catch (error) {
        console.error('Error getting admins:', error);
        return [];
    }
}
// Función para subir foto al bucket
async function uploadPhoto(fileBuffer, fileName) {
    try {
        const { data, error } = await exports.supabase
            .storage
            .from('agency-photos')
            .upload(`photos/${fileName}`, fileBuffer, {
            contentType: 'image/jpeg',
            upsert: true
        });
        if (error)
            throw error;
        // Generar URL firmada que expira en 1 año
        const signedUrlResponse = await exports.supabase
            .storage
            .from('agency-photos')
            .createSignedUrl(`photos/${fileName}`, 31536000); // 60*60*24*365 = 1 año en segundos
        if (signedUrlResponse.error)
            throw signedUrlResponse.error;
        return signedUrlResponse.data?.signedUrl || null;
    }
    catch (error) {
        console.error('Error uploading photo:', error);
        return null;
    }
}
// Función para crear un listing
async function createListing(data) {
    try {
        const { data: listing, error } = await exports.supabase
            .from('listings')
            .insert([data])
            .select()
            .single();
        if (error)
            throw error;
        return listing;
    }
    catch (error) {
        console.error('Error al crear listing:', error);
        return null;
    }
}
// Función para crear información de contacto
async function createRealEstateContactInfo(data) {
    try {
        const { data: contactInfo, error } = await exports.supabase
            .from('real_estate_contact_info')
            .insert([data])
            .select()
            .single();
        if (error)
            throw error;
        return contactInfo;
    }
    catch (error) {
        console.error('Error al crear información de contacto:', error);
        return null;
    }
}
