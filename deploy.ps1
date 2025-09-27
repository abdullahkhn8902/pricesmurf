# ---------- CONFIG ----------
$project = "neural-land-469712-t7"
$region = "asia-south1"
$serviceName = "pricesmurf"
$serviceAccountName = "nextjs-app-sa"
$serviceAccountEmail = "$serviceAccountName@$project.iam.gserviceaccount.com"
$secrets = @(
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
    "MONGODB_URI",
    "OPENROUTER_API_KEY"
)
# -----------------------------

# 1️⃣ Set the project
gcloud config set project $project

# 2️⃣ Create service account if missing
$saCheck = gcloud iam service-accounts list --filter="email:$serviceAccountEmail" --format="value(email)"
if (-not $saCheck) {
    Write-Host "Creating service account $serviceAccountEmail..."
    gcloud iam service-accounts create $serviceAccountName --display-name "Next.js App Service Account"
}

# 3️⃣ Grant roles for secrets
foreach ($s in $secrets) {
    gcloud secrets add-iam-policy-binding $s `
        --member="serviceAccount:$serviceAccountEmail" `
        --role="roles/secretmanager.secretAccessor" `
        --project=$project
}

# 4️⃣ Grant required roles for Cloud Run
gcloud projects add-iam-policy-binding $project `
    --member="serviceAccount:$serviceAccountEmail" `
    --role="roles/run.admin"

gcloud projects add-iam-policy-binding $project `
    --member="serviceAccount:$serviceAccountEmail" `
    --role="roles/storage.admin"

# 5️⃣ Deploy to Cloud Run using Buildpacks
Write-Host "Deploying Next.js app to Cloud Run..."
gcloud run deploy $serviceName `
    --source . `
    --region=$region `
    --allow-unauthenticated `
    --service-account=$serviceAccountEmail

# 6️⃣ Open deployed app
gcloud run services describe $serviceName --region=$region --format="value(status.url)"

Write-Host "✅ Deployment finished successfully!"
