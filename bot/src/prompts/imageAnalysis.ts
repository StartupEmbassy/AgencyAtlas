export const IMAGE_ANALYSIS_PROMPT = `Analyze this real estate agency image and provide ONLY a JSON object with this exact format:
{
    "name": "the business name if visible (be very specific, this is critical)",
    "web_url": "any website URL visible in the image (be very specific about official website vs listing URLs)",
    "qr_data": "any QR code content if visible in the image",
    "validation_score": number from 0-100 indicating how clearly this is a real estate agency,
    "validation_reasons": ["list", "of", "reasons", "be very specific about what you see"],
    "condition_score": number from 0-100 indicating the condition of the property,
    "objects_detected": ["list", "of", "objects", "detected", "in", "the", "image", "IMPORTANT: be very specific about storefront/facade/building/office if present"],
    "phone_numbers": ["list", "of", "phone", "numbers", "found"],
    "emails": ["list", "of", "email", "addresses", "found"],
    "business_hours": "business hours if visible (in text format)",
    "confidence": number from 0-1 indicating confidence in business name detection
}

IMPORTANT NOTES:
1. For objects_detected, be very specific about storefront/facade/building/office elements. These are critical for determining if this is a main photo.
2. Include detailed descriptions like "real estate office storefront", "agency facade", "commercial building entrance", etc.
3. The presence of these elements helps determine if this is a main photo of the agency.
4. If you see a storefront/facade/building/office, make sure to include it in objects_detected.
5. Be thorough in validation_reasons, explaining what makes this a real estate agency image.
6. For web_url, prioritize official agency websites over listing URLs. Look for URLs that match the business name.
7. For QR codes, look for any visible QR codes in the image and mention them in qr_data.`; 