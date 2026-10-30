import uuid


def new_id(prefix: str = "cmp") -> str:
    return f"{prefix}_{uuid.uuid4()}"
