from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_db_url: str
    secret_key: str
    minio_endpoint: str
    minio_public_endpoint: str = "localhost:9000"
    minio_access_key: str
    minio_secret_key: str
    minio_bucket: str = "akaar"
    redis_host: str = "redis"
    redis_port: int = 6379
    allowed_origins: str = ""
    instantmesh_mode: str = "stub"
    instantmesh_api_url: str = ""  # GPU workstation's InstantMesh API endpoint; empty = not configured yet

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
