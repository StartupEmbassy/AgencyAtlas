export interface RealEstateRegistration {
    started_at: number;
    last_update: number;
    messages_ids: number[];
    photos: {
        file_id: string;
        is_main: boolean | null;
        analysis?: {
            name?: string;
            qr_data?: string;
            web_url?: string;
            validation_score?: number;
            validation_reasons?: string[];
            condition_score?: number;
            image_quality?: any;
            objects_detected?: string[];
            phone_numbers?: string[];
            emails?: string[];
            business_hours?: string;
            confidence?: number;
        };
    }[];
    name?: string;
    qr?: string;
    web_url?: string;
    location?: {
        latitude: number;
        longitude: number;
    };
    contact_info?: {
        phone_numbers?: string[];
        emails?: string[];
        business_hours?: string;
    };
}

export interface RealEstate {
    id: string;
    user_id: string;
    name: string;
    photo_url: string;
    qr_info?: string | null;
    web_url?: string | null;
    latitude: number;
    longitude: number;
    created_by: string;
    updated_by: string;
    is_active: boolean;
    validation_score?: number | null;
    validation_reasons?: string[] | null;
    condition_score?: number | null;
    image_quality?: any | null;
    objects_detected?: string[] | null;
}

export interface Listing {
    id: string;
    real_estate_id: string;
    photo_url: string;
    qr_data?: string;
    web_url?: string;
    created_by: string;
    updated_by: string;
    is_active: boolean;
}

export interface RealEstateContactInfo {
    id: string;
    real_estate_id: string;
    phone_numbers?: string[];
    emails?: string[];
    business_hours?: string;
    services?: string[];
} 