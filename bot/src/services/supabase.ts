import { createClient } from '@supabase/supabase-js/dist/main/index';
import { Bot } from "grammy";
import dotenv from 'dotenv';
import path from 'path';
import fetch from 'cross-fetch';
import { RealEstate, Listing, RealEstateContactInfo } from '../types/types';

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, '../../.env') });

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY || !process.env.BOT_TOKEN) {
    throw new Error('Las credenciales de Supabase y BOT_TOKEN son requeridas');
}

// Crear instancia del bot para notificaciones
const notificationBot = new Bot(process.env.BOT_TOKEN);

// Crear el cliente de Supabase con opciones adicionales
export const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY,
    {
        auth: {
            autoRefreshToken: true,
            persistSession: false
        },
        global: {
            fetch: fetch
        }
    }
);

// Tipos para las tablas
export interface User {
    id: string;
    telegram_id: string;
    username: string;
    role: 'admin' | 'user';
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
    updated_at: string;
}

// Funciones de usuario
export async function createUser(telegramId: string, username: string): Promise<User | null> {
    try {
        const { data, error } = await supabase
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

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error creating user:', error);
        return null;
    }
}

export async function getUserByTelegramId(telegram_id: string, username?: string) {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('telegram_id', telegram_id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // Usuario no encontrado, crearlo como pendiente
                const { data: newUser, error: createError } = await supabase
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
    } catch (error) {
        console.error('Error in getUserByTelegramId:', error);
        return null;
    }
}

async function notifyAdmins(message: string) {
    try {
        const { data: admins } = await supabase
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
                    } else {
                        await notificationBot.api.sendMessage(admin.telegram_id, message);
                    }
                } catch (error) {
                    console.error(`Error sending notification to admin ${admin.telegram_id}:`, error);
                }
            }
        } else {
            console.warn('No admins found to notify');
        }
    } catch (error) {
        console.error('Error notifying admins:', error);
    }
}

export async function updateUserStatus(telegramId: string, status: User['status']): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('users')
            .update({ status })
            .eq('telegram_id', telegramId);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error updating user status:', error);
        return false;
    }
}

// Funciones de inmobiliarias
export async function createRealEstate(data: Omit<RealEstate, 'id' | 'created_at' | 'updated_at'>): Promise<RealEstate | null> {
    try {
        const { data: realEstate, error } = await supabase
            .from('real_estates')
            .insert([data])
            .select()
            .single();

        if (error) throw error;
        return realEstate;
    } catch (error) {
        console.error('Error al crear inmobiliaria:', error);
        return null;
    }
}

export async function getRealEstatesByUserId(userId: string): Promise<RealEstate[]> {
    try {
        const { data, error } = await supabase
            .from('real_estates')
            .select('*')
            .eq('user_id', userId);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting real estates:', error);
        return [];
    }
}

// Función para actualizar inmobiliaria
export async function updateRealEstate(
    id: string, 
    userId: string, 
    data: Partial<Omit<RealEstate, 'id' | 'created_at' | 'updated_at' | 'created_by'>>
): Promise<RealEstate | null> {
    try {
        const { data: updatedRealEstate, error } = await supabase
            .from('real_estates')
            .update({ ...data, updated_by: userId })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return updatedRealEstate;
    } catch (error) {
        console.error('Error updating real estate:', error);
        return null;
    }
}

// Función para soft delete de inmobiliaria
export async function deleteRealEstate(id: string, userId: string): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('real_estates')
            .update({ 
                is_active: false,
                updated_by: userId 
            })
            .eq('id', id);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error deleting real estate:', error);
        return false;
    }
}

// Función para obtener todos los administradores
export async function getAdmins(): Promise<User[]> {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('role', 'admin');

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting admins:', error);
        return [];
    }
}

// Función para subir foto al bucket
export async function uploadPhoto(fileBuffer: Buffer, fileName: string): Promise<string | null> {
    try {
        const { data, error } = await supabase
            .storage
            .from('agency-photos')
            .upload(`photos/${fileName}`, fileBuffer, {
                contentType: 'image/jpeg',
                upsert: true
            });

        if (error) throw error;

        // Generar URL firmada que expira en 1 año
        const signedUrlResponse = await supabase
            .storage
            .from('agency-photos')
            .createSignedUrl(`photos/${fileName}`, 31536000); // 60*60*24*365 = 1 año en segundos

        if (signedUrlResponse.error) throw signedUrlResponse.error;
        return signedUrlResponse.data?.signedUrl || null;

    } catch (error) {
        console.error('Error uploading photo:', error);
        return null;
    }
}

// Función para crear información de contacto
export async function createRealEstateContactInfo(data: Omit<RealEstateContactInfo, 'id'>): Promise<RealEstateContactInfo | null> {
    try {
        const { data: contactInfo, error } = await supabase
            .from('real_estate_contact_info')
            .insert([data])
            .select()
            .single();

        if (error) throw error;
        return contactInfo;
    } catch (error) {
        console.error('Error al crear información de contacto:', error);
        return null;
    }
}

export const createListing = async (
    realEstateId: string, 
    photoUrl: string, 
    qrData: string | undefined,
    webUrl: string | undefined,
    userId: string
): Promise<{ data: Listing | null; error: any }> => {
    try {
        // Primero verificar si ya existe un listing con ese QR
        if (qrData) {
            const { data: existingListing } = await supabase
                .from('listings')
                .select('*')
                .eq('qr_data', qrData)
                .eq('real_estate_id', realEstateId)
                .single();

            if (existingListing) {
                return { data: existingListing, error: null };
            }
        }

        // Si no existe, crear nuevo listing
        const { data, error } = await supabase
            .from('listings')
            .insert({
                real_estate_id: realEstateId,
                photo_url: photoUrl,
                qr_data: qrData,
                web_url: webUrl,
                created_by: userId,
                updated_by: userId,
                is_active: true
            })
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Error creating listing:', error);
        return { data: null, error };
    }
};

/**
 * Verifica si ya existe un listing con el mismo QR para una inmobiliaria
 */
export async function checkExistingListing(realEstateId: string, qrData: string) {
    try {
        const { data, error } = await supabase
            .from('listings')
            .select('*')
            .eq('real_estate_id', realEstateId)
            .eq('qr_data', qrData)
            .eq('is_active', true)
            .single();

        if (error) {
            console.error('Error al verificar listing existente:', error);
            return null;
        }

        return data;
    } catch (error) {
        console.error('Error al verificar listing existente:', error);
        return null;
    }
} 