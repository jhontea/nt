package handler

func ErrorJSON(msg string) map[string]string {
	return map[string]string{"error": msg}
}
