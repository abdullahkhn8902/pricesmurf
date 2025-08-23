# ---------- CONFIG ----------
$project = "clear-beacon-469418-k8"
$region = "us-central"
$serviceAccountName = "nextjs-app-sa"
$serviceAccountEmail = "$serviceAccountName@$project.iam.gserviceaccount.com"
$version = "v1"   # Change version for new deploy
$appYamlPath = ".\app.yaml"
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

# 4️⃣ Grant roles for App Engine and Cloud Storage
gcloud projects add-iam-policy-binding $project `
    --member="serviceAccount:$serviceAccountEmail" `
    --role="roles/appengine.deployer"

# Ensure SA has storage access for Cloud Build
$bucket = "staging.$project.appspot.com"
gcloud storage buckets add-iam-policy-binding "gs://$bucket" `
    --member="serviceAccount:$serviceAccountEmail" `
    --role="roles/storage.objectAdmin"

# 5️⃣ Ensure App Engine exists
$appCheck = gcloud app describe --project=$project 2>$null
if (-not $appCheck) {
    Write-Host "Creating App Engine in region $region..."
    gcloud app create --region=$region
}

# 6️⃣ Update app.yaml to use service account
if (-Not (Test-Path $appYamlPath)) {
    Write-Host "app.yaml not found! Please create one with runtime nodejs20."
} else {
    $yamlContent = Get-Content $appYamlPath
    if ($yamlContent -notmatch "service_account:") {
        Add-Content -Path $appYamlPath -Value "`nservice_account: $serviceAccountEmail"
        Write-Host "Added service_account to app.yaml"
    } else {
        Write-Host "app.yaml already has service_account"
    }
}

# 7️⃣ Deploy the app
Write-Host "Deploying Next.js app..."
gcloud app deploy $appYamlPath --quiet --service-account=$serviceAccountEmail --version=$version

# 8️⃣ Open app in browser
gcloud app browse --project=$project

Write-Host "✅ Deployment finished successfully!"
