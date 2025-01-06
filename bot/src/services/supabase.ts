import { createClient } from '@supabase/supabase-js/dist/main/index';
import dotenv from 'dotenv';
import path from 'path';
import fetch from 'cross-fetch';

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, '../../.env') });

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    throw new Error('Las credenciales de Supabase son requeridas');
}

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

export interface RealEstate {
    id: string;
    user_id: string;
    name: string;
    photo_url: string;
    qr_info: string | null;
    latitude: number;
    longitude: number;
    created_at: string;
    created_by: string;
    updated_at: string;
    updated_by: string;
    is_active: boolean;
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

export async function getUserByTelegramId(telegramId: string): Promise<User | null> {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('telegram_id', telegramId)
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error getting user:', error);
        return null;
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
export async function createRealEstate(
    data: Omit<RealEstate, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'>
): Promise<RealEstate | null> {
    try {
        const { data: newRealEstate, error } = await supabase
            .from('real_estates')
            .insert([{
                ...data,
                created_by: data.user_id,
                updated_by: data.user_id
            }])
            .select()
            .single();

        if (error) throw error;
        return newRealEstate;
    } catch (error) {
        console.error('Error creating real estate:', error);
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