"""MinIO storage helpers via boto3 (existing dependency; minio-py not in requirements.txt).

secure=False for local/dev (Docker Compose internal network) => http:// endpoint scheme.
"""
import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from .config import settings


def get_minio_client():
    # boto3 S3 client pointed at MinIO. secure=False => http:// (dev/local).
    return boto3.client(
        "s3",
        endpoint_url=f"http://{settings.minio_endpoint}",
        aws_access_key_id=settings.minio_access_key,
        aws_secret_access_key=settings.minio_secret_key,
        region_name="us-east-1",
        config=Config(signature_version="s3v4"),
    )


def ensure_bucket_exists() -> None:
    client = get_minio_client()
    try:
        client.head_bucket(Bucket=settings.minio_bucket)
    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        if code == "404":
            client.create_bucket(Bucket=settings.minio_bucket)
        elif code == "403":
            # Bucket exists (head denied for lack of permission) — treat as present.
            pass
        else:
            raise


def upload_file(file_bytes: bytes, object_key: str, content_type: str) -> str:
    client = get_minio_client()
    client.put_object(
        Bucket=settings.minio_bucket,
        Key=object_key,
        Body=file_bytes,
        ContentType=content_type,
    )
    return object_key


def get_presigned_url(object_key: str, expires_seconds: int = 3600) -> str:
    client = get_minio_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.minio_bucket, "Key": object_key},
        ExpiresIn=expires_seconds,
    )


def get_browser_url(object_key: str, expires_seconds: int = 3600) -> str:
    """Presigned URL signed for the browser-reachable MinIO endpoint.

    Presigned URLs must be signed with the Host the browser will actually use
    (otherwise the signature won't match and MinIO returns 403). MINIO_PUBLIC_ENDPOINT
    is the externally-visible address (dev: localhost:9000). generate_presigned_url is
    pure signing (no network call), so building the client against the public endpoint
    is safe from inside the api container. ponytail: dev-only convenience; production
    would serve files through the API instead.
    """
    client = boto3.client(
        "s3",
        endpoint_url=f"http://{settings.minio_public_endpoint}",
        aws_access_key_id=settings.minio_access_key,
        aws_secret_access_key=settings.minio_secret_key,
        region_name="us-east-1",
        config=Config(signature_version="s3v4"),
    )
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.minio_bucket, "Key": object_key},
        ExpiresIn=expires_seconds,
    )


def delete_file(object_key: str) -> None:
    client = get_minio_client()
    client.delete_object(Bucket=settings.minio_bucket, Key=object_key)
