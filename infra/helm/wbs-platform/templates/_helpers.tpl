{{- define "wbs-platform.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "wbs-platform.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "wbs-platform.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
app.kubernetes.io/name: {{ include "wbs-platform.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "wbs-platform.selectorLabels" -}}
app.kubernetes.io/name: {{ include "wbs-platform.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "wbs-platform.databaseSecretName" -}}
{{- if .Values.postgresql.enabled -}}
{{- default (printf "%s-postgresql" (include "wbs-platform.fullname" .)) .Values.postgresql.auth.existingSecret -}}
{{- else -}}
{{- default (printf "%s-external-postgresql" (include "wbs-platform.fullname" .)) .Values.externalPostgresql.existingSecret -}}
{{- end -}}
{{- end -}}

{{- define "wbs-platform.databaseHost" -}}
{{- if .Values.postgresql.enabled -}}
{{- printf "%s-postgresql" (include "wbs-platform.fullname" .) -}}
{{- else -}}
{{- required "externalPostgresql.host is required when postgresql.enabled=false" .Values.externalPostgresql.host -}}
{{- end -}}
{{- end -}}

{{- define "wbs-platform.databasePort" -}}
{{- if .Values.postgresql.enabled -}}
{{- .Values.postgresql.service.port -}}
{{- else -}}
{{- .Values.externalPostgresql.port -}}
{{- end -}}
{{- end -}}

{{- define "wbs-platform.apiServiceName" -}}
{{- printf "%s-api" (include "wbs-platform.fullname" .) -}}
{{- end -}}

{{- define "wbs-platform.portalServiceName" -}}
{{- printf "%s-portal" (include "wbs-platform.fullname" .) -}}
{{- end -}}
