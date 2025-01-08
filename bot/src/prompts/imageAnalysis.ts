export const IMAGE_ANALYSIS_PROMPT = `Analyze this real estate agency image and provide ONLY a JSON object with this exact format:
{
    "name": "the business name if visible (be very specific, this is critical)",
    "web_url": "any website URL visible in the image",
    "validation_score": number from 0-100 indicating how clearly this is a real estate agency,
    "validation_reasons": ["list", "of", "reasons"],
    "condition_score": number from 0-100 indicating the condition of the property,
    "objects_detected": ["list", "of", "objects", "like", "storefront", "sign", "etc"],
    "phone_numbers": ["list", "of", "phone", "numbers", "found"],
    "emails": ["list", "of", "email", "addresses", "found"],
    "business_hours": "business hours if visible (in text format)",
    "confidence": number from 0-1 indicating confidence in business name detection
}`; 