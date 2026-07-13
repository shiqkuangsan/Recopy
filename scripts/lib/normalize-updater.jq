($release[0].assets
  | map({ key: (.id | tostring), value: .name })
  | from_entries) as $asset_names
| ($release[0].assets | map(.name)) as $release_asset_names
| if .version != $version then
    error("updater version \(.version) does not match tag version \($version)")
  elif (.platforms | keys) != ($expected_platform_assets | keys) then
    error("updater platform keys do not match the required Recopy platforms")
  elif (([.platforms[].signature | (type == "string" and length > 0)] | all) == false) then
    error("updater signatures must be nonempty strings")
  else
    .
  end
| .platforms |= with_entries(
    .key as $platform
    | .value.url as $source_url
    | (if ($source_url | startswith($github_asset_api_prefix)) then
        ($source_url | split("/")[-1]) as $asset_id
        | ($asset_names[$asset_id]
            // error("unknown GitHub release asset id: \($asset_id)")) as $asset_name
        | $asset_name
      elif ($source_url | startswith($github_download_prefix)) then
        $source_url | ltrimstr($github_download_prefix)
      elif ($source_url | startswith($gitee_download_prefix)) then
        $source_url | ltrimstr($gitee_download_prefix)
      else
        error("unsupported updater asset URL: \($source_url)")
      end) as $asset_name
    | if $asset_name != $expected_platform_assets[$platform] then
        error("unexpected asset for \($platform): \($asset_name)")
      elif ($release_asset_names | index($asset_name)) == null then
        error("updater asset is missing from the GitHub release: \($asset_name)")
      else
        .value.url = ($gitee_download_prefix + $asset_name)
      end
  )
| .notes = $notes
