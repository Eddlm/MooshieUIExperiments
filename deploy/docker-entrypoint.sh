#!/bin/sh
set -e

# ── Admin password guard ──
# Validate admin env vars and refuse to start with a placeholder password (the
# server would not create the admin account, leaving a deployment nobody can
# administer).
if [ -n "$MOOSHIEUI_ADMIN_USER" ] || [ -n "$MOOSHIEUI_ADMIN_PASS" ]; then
    if [ -z "$MOOSHIEUI_ADMIN_USER" ] || [ -z "$MOOSHIEUI_ADMIN_PASS" ]; then
        echo "ERROR: Both MOOSHIEUI_ADMIN_USER and MOOSHIEUI_ADMIN_PASS must be set." >&2
        exit 1
    fi
    if [ ${#MOOSHIEUI_ADMIN_PASS} -lt 4 ]; then
        echo "ERROR: MOOSHIEUI_ADMIN_PASS is too short (minimum 4 characters)." >&2
        exit 1
    fi
    case "$(printf '%s' "$MOOSHIEUI_ADMIN_PASS" | tr '[:upper:]' '[:lower:]')" in
        changeme|replace_me)
            echo "" >&2
            echo "========================================================" >&2
            echo "  ERROR: MOOSHIEUI_ADMIN_PASS is a placeholder." >&2
            echo "  The server will not create an admin account with it." >&2
            echo "  Set a strong password before exposing this server." >&2
            echo "========================================================" >&2
            echo "" >&2
            exit 1
            ;;
    esac
fi

# ── Volume ownership ──
# The image runs as the unprivileged user mooshie (uid 10001, gid 10001). Volumes
# created by earlier images, which ran as root, are root-owned: say how to fix
# that instead of failing later on the first write.
for dir in /data /data/models; do
    if [ -e "$dir" ] && [ ! -w "$dir" ]; then
        echo "ERROR: $dir is not writable by uid $(id -u) (gid $(id -g))." >&2
        echo "  Hand the volume to the image's user once, e.g.:" >&2
        echo "    docker run --rm --user 0 -v <volume-or-host-path>:$dir --entrypoint chown <image> -R 10001:10001 $dir" >&2
        echo "  or, for a host directory: sudo chown -R 10001:10001 <host-path>" >&2
        echo "  On Kubernetes, set the pod securityContext fsGroup: 10001 (see deploy/k8s/deployment.yaml)." >&2
        exit 1
    fi
done

# Ensure the persistent models directory exists.
mkdir -p /data/models

# ── Owner defaults ──
# Seed settings on a fresh volume. Each file is written only when it is absent,
# so anything changed in the UI wins for the rest of that volume's life.
# `env:CIVITAI_API_KEY` keeps the CivitAI key in the container environment
# (passed at launch) rather than storing it on disk.
if [ -f /app/defaults/config.json ] && [ ! -f /data/config.json ]; then
    cp /app/defaults/config.json /data/config.json
    echo "Seeded /data/config.json from the image defaults."
fi

# An admin account's prefs live under the shared owner key (`_admin`), not under
# its username, so seed both: whichever one the server resolves to, the file is
# already there.
for prefs_user in _admin "${MOOSHIEUI_ADMIN_USER:-admin}"; do
    prefs_dir="/data/users/${prefs_user}"
    if [ -f /app/defaults/prefs.json ] && [ ! -f "$prefs_dir/prefs.json" ]; then
        mkdir -p "$prefs_dir"
        cp /app/defaults/prefs.json "$prefs_dir/prefs.json"
        echo "Seeded $prefs_dir/prefs.json from the image defaults."
    fi
done

# ── Optional background model pull ──
# Mooshie's own downloader does the whole transfer inside one request and stalls
# partway on large CivitAI files. This pulls the same file with curl instead:
# `-C -` resumes from whatever is on disk, `--retry-all-errors` retries a dropped
# connection, and the whole loop runs in the background so the app starts
# immediately. Driven by:
#   MOOSHIEUI_PULL_URL    direct download URL (token included)
#   MOOSHIEUI_PULL_FILE   filename to write under checkpoints/
#   MOOSHIEUI_PULL_SHA256 optional expected hash, lower or upper case
if [ -n "$MOOSHIEUI_PULL_URL" ] && [ -n "$MOOSHIEUI_PULL_FILE" ]; then
    pull_target="/data/models/checkpoints/${MOOSHIEUI_PULL_FILE}"
    mkdir -p /data/models/checkpoints
    (
        attempt=0
        while [ "$attempt" -lt 200 ]; do
            if curl -sS -L --retry 100 --retry-delay 5 --retry-all-errors \
                --connect-timeout 30 -C - -o "$pull_target" "$MOOSHIEUI_PULL_URL" \
                >> /data/model-pull.log 2>&1; then
                size=$(stat -c %s "$pull_target" 2>/dev/null || echo 0)
                echo "pull complete attempt=$attempt size=$size" >> /data/model-pull.log
                if [ -z "$MOOSHIEUI_PULL_SHA256" ]; then
                    break
                fi
                sum=$(sha256sum "$pull_target" 2>/dev/null | cut -d' ' -f1 | tr 'A-Z' 'a-z')
                want=$(printf '%s' "$MOOSHIEUI_PULL_SHA256" | tr 'A-Z' 'a-z')
                if [ "$sum" = "$want" ]; then
                    echo "pull hash ok" >> /data/model-pull.log
                    break
                fi
                echo "pull hash mismatch (got $sum) - resuming" >> /data/model-pull.log
            fi
            attempt=$((attempt + 1))
            size=$(stat -c %s "$pull_target" 2>/dev/null || echo 0)
            echo "[pull] attempt=$attempt size=$size"
            sleep 5
        done
        echo "pull loop exited after $attempt attempts" >> /data/model-pull.log
    ) &
    echo "Background model pull queued: ${MOOSHIEUI_PULL_FILE}"
fi

# Replace ComfyUI's models/ with a symlink to the persistent volume.
# This ensures downloaded models survive container recreation.
# The symlink may have been broken by a volume overlay.
if [ ! -L "${COMFYUI_PATH}/models" ] || [ "$(readlink "${COMFYUI_PATH}/models")" != "/data/models" ]; then
    rm -rf "${COMFYUI_PATH}/models"
    ln -s /data/models "${COMFYUI_PATH}/models"
fi

# Copy default ComfyUI model subdirectory structure if the volume is fresh.
# This is needed because ComfyUI expects certain subdirectories to exist.
for subdir in checkpoints clip clip_vision configs controlnet diffusers diffusion_models embeddings gligen hypernetworks loras photomaker style_models unet upscale_models vae vae_approx ultralytics; do
    mkdir -p "/data/models/${subdir}"
done

exec "$@"
