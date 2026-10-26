package com.orangesoundguild.remote

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object Api {
    class HttpError(val code: Int, message: String) : Exception(message)

    fun post(server: String, path: String, body: JSONObject): JSONObject {
        val conn = URL(server.trimEnd('/') + path).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 10_000
            conn.readTimeout = 15_000
            conn.doOutput = true
            conn.setRequestProperty("content-type", "application/json")
            conn.outputStream.use { it.write(body.toString().toByteArray()) }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: "{}"
            val json = try { JSONObject(text) } catch (_: Exception) { JSONObject() }
            if (code !in 200..299) throw HttpError(code, json.optString("error", "Request failed ($code)"))
            return json
        } finally {
            conn.disconnect()
        }
    }
}
