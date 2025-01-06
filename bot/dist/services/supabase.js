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
exports.getAdmins = getAdmins;
const module_1 = require("@supabase/supabase-js/dist/module");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Cargar variables de entorno
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../../../.env') });
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    throw new Error('Las credenciales de Supabase son requeridas');
}
// Crear el cliente de Supabase
exports.supabase = (0, module_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
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
async function getUserByTelegramId(telegramId) {
    try {
        const { data, error } = await exports.supabase
            .from('users')
            .select('*')
            .eq('telegram_id', telegramId)
            .single();
        if (error)
            throw error;
        return data;
    }
    catch (error) {
        console.error('Error getting user:', error);
        return null;
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
        const { data: newRealEstate, error } = await exports.supabase
            .from('real_estates')
            .insert([data])
            .select()
            .single();
        if (error)
            throw error;
        return newRealEstate;
    }
    catch (error) {
        console.error('Error creating real estate:', error);
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
