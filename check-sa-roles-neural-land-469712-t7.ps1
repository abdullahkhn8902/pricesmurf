<#
check-sa-roles-neural-land-469712-t7.ps1
Description: Lists all service accounts in the project and the project-level roles bound to them.
            Optionally fetches each service account's IAM policy to show who can impersonate them.

Project: Pricesmurf Project
Project Number: 641189217314
Project ID: neural-land-469712-t7

Prereqs: gcloud installed and authenticated, and you have permission to run
         `gcloud projects get-iam-policy` (roles/resourcemanager.projectIamAdmin OR roles/viewer + resourcemanager.getIamPolicy).

Usage:
  .\check-sa-roles-neural-land-469712-t7.ps1                 # uses prefilled project id
  .\check-sa-roles-neural-land-469712-t7.ps1 -ProjectId other-project-id
  .\check-sa-roles-neural-land-469712-t7.ps1 -IncludeImpersonation  # also fetches each SA's IAM policy
#>

param(
  [string]$ProjectId = "neural-land-469712-t7",
  [switch]$IncludeImpersonation
)

Write-Host "Checking project:" $ProjectId

# Fetch project IAM policy
try {
  $projPolicyJson = & gcloud projects get-iam-policy $ProjectId --format=json 2>$null
  if (-not $projPolicyJson) { throw "empty" }
} catch {
  Write-Error "Failed to fetch project IAM policy for project '$ProjectId'. Ensure you have permission and the project exists."
  exit 1
}
$projPolicy = $projPolicyJson | ConvertFrom-Json

# Build role -> members map
$roleBindings = @{}
foreach ($b in $projPolicy.bindings) {
  $roleBindings[$b.role] = $b.members
}

# List service accounts in the project
try {
  $saJson = & gcloud iam service-accounts list --project=$ProjectId --format=json 2>$null
  if (-not $saJson) { throw "empty" }
} catch {
  Write-Error "Failed to list service accounts for project '$ProjectId'. Ensure the project exists and you have permissions."
  exit 1
}
$serviceAccounts = $saJson | ConvertFrom-Json

# Prepare results
$results = @()

foreach ($sa in $serviceAccounts) {
  $email = $sa.email
  $displayName = $sa.displayName
  $rolesForSa = @()

  foreach ($role in $roleBindings.Keys) {
    $members = $roleBindings[$role]
    if ($members -and ($members -contains "serviceAccount:$email")) {
      $roleTitle = ""
      $roleDesc = ""
      try {
        $roleInfoJson = & gcloud iam roles describe $role --format=json 2>$null
        if ($roleInfoJson) {
          $roleInfo = $roleInfoJson | ConvertFrom-Json
          $roleTitle = $roleInfo.title
          $roleDesc = ($roleInfo.description -replace "`r?`n"," ")
        }
      } catch {
        # ignore — role might be custom in org/folder scope or inaccessible
      }
      $rolesForSa += [PSCustomObject]@{
        Role = $role
        Title = $roleTitle
        Description = $roleDesc
      }
    }
  }

  $impersonation = $null
  if ($IncludeImpersonation) {
    try {
      $saPolicyJson = & gcloud iam service-accounts get-iam-policy $email --project=$ProjectId --format=json 2>$null
      if ($saPolicyJson) {
        $saPolicy = $saPolicyJson | ConvertFrom-Json
        $impBindings = @()
        foreach ($b in $saPolicy.bindings) {
          if ($b.role -match "(roles/iam.serviceAccountUser|roles/iam.serviceAccountTokenCreator|roles/iam.serviceAccountKeyAdmin|roles/iam.serviceAccountAdmin)") {
            $impBindings += [PSCustomObject]@{ Role = $b.role; Members = ($b.members -join ", ") }
          }
        }
        $impersonation = $impBindings
      }
    } catch {
      $impersonation = "(unable to fetch service-account IAM policy: insufficient permissions)"
    }
  }

  if ($rolesForSa.Count -eq 0) {
    $results += [PSCustomObject]@{
      ServiceAccount = $email
      DisplayName = $displayName
      Roles = "(none bound at project-level)"
      Details = $null
      Impersonation = $impersonation
    }
  } else {
    $roleList = @()
    foreach ($r in $rolesForSa) { $roleList += $r.Role }
    $results += [PSCustomObject]@{
      ServiceAccount = $email
      DisplayName = $displayName
      Roles = ($roleList -join ", ")
      Details = $rolesForSa
      Impersonation = $impersonation
    }
  }
}

$results | Select-Object ServiceAccount, DisplayName, Roles | Format-Table -AutoSize

$outFile = "service-accounts-roles-$ProjectId.json"
$results | ConvertTo-Json -Depth 8 | Out-File $outFile -Encoding UTF8
Write-Host "`nSaved detailed output to $outFile"

if ($IncludeImpersonation) {
  Write-Host "Impersonation details were requested; check the Impersonation field in the JSON for each service account."
} else {
  Write-Host "Tip: re-run with -IncludeImpersonation to also show which principals can impersonate each service account."
}

Write-Host "Done. If you want a version that also scans buckets, BigQuery datasets, or org/folder-level bindings, tell me and I will extend it."
