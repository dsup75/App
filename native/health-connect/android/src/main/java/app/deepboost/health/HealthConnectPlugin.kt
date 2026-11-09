package app.deepboost.health

// DeepBoost Life — reads today's activity from Android Health Connect.
// Based on the MIT-licensed capacitor-health plugin by Martin Ley (github.com/mley/capacitor-health),
// trimmed and extended (sleep, heart rate). Only reads data; never writes. Missing data -> null, never invented.

import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.Instant
import java.util.concurrent.atomic.AtomicReference

@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {

    private val readPermissions = setOf(
        "android.permission.health.READ_STEPS",
        "android.permission.health.READ_ACTIVE_CALORIES_BURNED",
        "android.permission.health.READ_TOTAL_CALORIES_BURNED",
        "android.permission.health.READ_DISTANCE",
        "android.permission.health.READ_HEART_RATE",
        "android.permission.health.READ_SLEEP",
        "android.permission.health.READ_WEIGHT",
        "android.permission.health.READ_BODY_FAT"
    )

    private var client: HealthConnectClient? = null
    private var launcher: ActivityResultLauncher<Set<String>>? = null
    private val pendingCall = AtomicReference<PluginCall?>(null)

    override fun load() {
        super.load()
        try {
            launcher = activity.registerForActivityResult(
                PermissionController.createRequestPermissionResultContract()
            ) { granted: Set<String> ->
                val call = pendingCall.getAndSet(null)
                if (call != null) call.resolve(grantedResult(granted))
            }
        } catch (e: Exception) {
            launcher = null
        }
    }

    private fun getClient(): HealthConnectClient? {
        if (client != null) return client
        return try {
            if (HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE) {
                client = HealthConnectClient.getOrCreate(context)
            }
            client
        } catch (e: Exception) {
            null
        }
    }

    private fun short(p: String) = p.substringAfterLast('.')

    private fun grantedResult(granted: Set<String>): JSObject {
        val g = granted.map { short(it) }.toSet()
        val o = JSObject()
        val perms = JSObject()
        for (p in readPermissions) perms.put(short(p), g.contains(short(p)))
        o.put("permissions", perms)
        o.put("anyGranted", readPermissions.any { g.contains(short(it)) })
        return o
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val status = try { HealthConnectClient.getSdkStatus(context) } catch (e: Exception) { -1 }
        val o = JSObject()
        o.put("available", status == HealthConnectClient.SDK_AVAILABLE)
        o.put("needsUpdate", status == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED)
        call.resolve(o)
    }

    @PluginMethod
    fun checkAccess(call: PluginCall) {
        val c = getClient()
        if (c == null) { call.reject("Health Connect is not available"); return }
        CoroutineScope(Dispatchers.IO).launch {
            try {
                call.resolve(grantedResult(c.permissionController.getGrantedPermissions()))
            } catch (e: Exception) {
                call.reject("Could not check access: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun requestAccess(call: PluginCall) {
        val l = launcher
        if (getClient() == null || l == null) { call.reject("Health Connect is not available"); return }
        pendingCall.getAndSet(call)?.reject("Replaced by a new request")
        activity.runOnUiThread {
            try {
                l.launch(readPermissions)
            } catch (e: Exception) {
                pendingCall.set(null)
                call.reject("Could not open Health Connect: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun openSettings(call: PluginCall) {
        try {
            val intent = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            try {
                val i = Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata"))
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(i)
                call.resolve()
            } catch (e2: Exception) {
                call.reject(e2.message)
            }
        }
    }

    // readToday({ startDate, endDate, sleepStartDate }) — ISO strings
    @PluginMethod
    fun readToday(call: PluginCall) {
        val c = getClient()
        if (c == null) { call.reject("Health Connect is not available"); return }
        val start: Instant
        val end: Instant
        val sleepStart: Instant
        try {
            start = Instant.parse(call.getString("startDate"))
            end = Instant.parse(call.getString("endDate"))
            sleepStart = Instant.parse(call.getString("sleepStartDate") ?: call.getString("startDate"))
        } catch (e: Exception) {
            call.reject("Bad dates")
            return
        }
        val range = TimeRangeFilter.between(start, end)

        CoroutineScope(Dispatchers.IO).launch {
            val granted = try {
                c.permissionController.getGrantedPermissions().map { short(it) }.toSet()
            } catch (e: Exception) {
                emptySet<String>()
            }
            fun has(p: String) = granted.contains(p)
            val o = JSObject()

            // Steps
            var steps: Long? = null
            if (has("READ_STEPS")) {
                try { steps = c.aggregate(AggregateRequest(setOf(StepsRecord.COUNT_TOTAL), range))[StepsRecord.COUNT_TOTAL] } catch (e: Exception) { }
            }
            o.put("steps", steps ?: JSONObject.NULL)

            // Calories: active calories first (only what a device/app recorded); total only as fallback
            var kcal: Double? = null
            if (has("READ_ACTIVE_CALORIES_BURNED")) {
                try {
                    kcal = c.aggregate(AggregateRequest(setOf(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL), range))[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories
                } catch (e: Exception) { }
            }
            if (kcal == null && has("READ_TOTAL_CALORIES_BURNED")) {
                try {
                    kcal = c.aggregate(AggregateRequest(setOf(TotalCaloriesBurnedRecord.ENERGY_TOTAL), range))[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories
                } catch (e: Exception) { }
            }
            o.put("calories", kcal ?: JSONObject.NULL)

            // Distance (metres)
            var metres: Double? = null
            if (has("READ_DISTANCE")) {
                try { metres = c.aggregate(AggregateRequest(setOf(DistanceRecord.DISTANCE_TOTAL), range))[DistanceRecord.DISTANCE_TOTAL]?.inMeters } catch (e: Exception) { }
            }
            o.put("distanceMeters", metres ?: JSONObject.NULL)

            // Heart rate: average for today + latest sample
            var hrAvg: Long? = null
            var hrLatest: Long? = null
            var hrLatestAt: String? = null
            if (has("READ_HEART_RATE")) {
                try { hrAvg = c.aggregate(AggregateRequest(setOf(HeartRateRecord.BPM_AVG), range))[HeartRateRecord.BPM_AVG] } catch (e: Exception) { }
                try {
                    val recs = c.readRecords(
                        ReadRecordsRequest(
                            recordType = HeartRateRecord::class,
                            timeRangeFilter = range,
                            ascendingOrder = false,
                            pageSize = 20
                        )
                    ).records
                    val last = recs.flatMap { it.samples }.maxByOrNull { it.time }
                    if (last != null) {
                        hrLatest = last.beatsPerMinute
                        hrLatestAt = last.time.toString()
                    }
                } catch (e: Exception) { }
            }
            o.put("heartRateAvg", hrAvg ?: JSONObject.NULL)
            o.put("heartRateLatest", hrLatest ?: JSONObject.NULL)
            o.put("heartRateLatestAt", hrLatestAt ?: JSONObject.NULL)

            // Sleep: sessions that ended between sleepStart and now, minus awake stages
            var sleepMinutes: Long? = null
            if (has("READ_SLEEP")) {
                try {
                    val sessions = c.readRecords(
                        ReadRecordsRequest(
                            recordType = SleepSessionRecord::class,
                            timeRangeFilter = TimeRangeFilter.between(sleepStart, end),
                            pageSize = 50
                        )
                    ).records
                    if (sessions.isNotEmpty()) {
                        var total = 0L
                        for (s in sessions) {
                            var secs = s.endTime.epochSecond - s.startTime.epochSecond
                            for (st in s.stages) {
                                if (st.stage == SleepSessionRecord.STAGE_TYPE_AWAKE || st.stage == SleepSessionRecord.STAGE_TYPE_OUT_OF_BED) {
                                    secs -= (st.endTime.epochSecond - st.startTime.epochSecond)
                                }
                            }
                            if (secs > 0) total += secs
                        }
                        sleepMinutes = total / 60
                    }
                } catch (e: Exception) { }
            }
            o.put("sleepMinutes", sleepMinutes ?: JSONObject.NULL)

            // Latest weight / body fat in the last 30 days (written by a scale app, if any)
            val monthRange = TimeRangeFilter.between(end.minusSeconds(30L * 86400L), end)
            var weightKg: Double? = null
            var weightAt: String? = null
            if (has("READ_WEIGHT")) {
                try {
                    val w = c.readRecords(
                        ReadRecordsRequest(recordType = WeightRecord::class, timeRangeFilter = monthRange, ascendingOrder = false, pageSize = 1)
                    ).records.firstOrNull()
                    if (w != null) {
                        weightKg = w.weight.inKilograms
                        weightAt = w.time.toString()
                    }
                } catch (e: Exception) { }
            }
            o.put("weightKg", weightKg ?: JSONObject.NULL)
            o.put("weightAt", weightAt ?: JSONObject.NULL)
            var fat: Double? = null
            if (has("READ_BODY_FAT")) {
                try {
                    val f = c.readRecords(
                        ReadRecordsRequest(recordType = BodyFatRecord::class, timeRangeFilter = monthRange, ascendingOrder = false, pageSize = 1)
                    ).records.firstOrNull()
                    if (f != null) fat = f.percentage.value
                } catch (e: Exception) { }
            }
            o.put("bodyFatPct", fat ?: JSONObject.NULL)

            val perms = JSObject()
            for (p in readPermissions) perms.put(short(p), has(short(p)))
            o.put("permissions", perms)
            call.resolve(o)
        }
    }
}
