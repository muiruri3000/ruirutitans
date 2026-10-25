from rest_framework.views import exception_handler


def custom_exception_handler(exc, context):
    """
    Standardizes DRF error responses to always include both 'detail' and 'error'
    for consistent API error handling across tests and frontend clients.
    """
    response = exception_handler(exc, context)
    if response is not None:
        if isinstance(response.data, dict):
            if "detail" in response.data and "error" not in response.data:
                response.data["error"] = str(response.data["detail"])
            elif "error" in response.data and "detail" not in response.data:
                response.data["detail"] = str(response.data["error"])
    return response
