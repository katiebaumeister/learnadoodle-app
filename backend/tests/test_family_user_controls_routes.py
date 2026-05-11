"""
Smoke tests for /api/family/user-controls GET/PATCH routes.
"""

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add backend to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from routers import family_routes


class TestFamilyUserControlsRoutes(unittest.IsolatedAsyncioTestCase):
    async def test_get_user_controls_smoke(self):
        expected = family_routes.FamilyUserControlsOut(
            childDefaultProfile="guided",
            children=[
                family_routes.ChildPermissionProfileRow(
                    id="child-1",
                    name="Avery",
                    permission_profile="guided",
                )
            ],
            tutors=[
                family_routes.TutorPermissionProfileRow(
                    id="member-1",
                    name="Tutor One",
                    email="tutor@example.com",
                    tutor_permission_profile="teaching",
                )
            ],
        )

        with patch.object(family_routes, "get_family_id_for_user", return_value="family-1"), patch.object(
            family_routes, "get_admin_client", return_value=MagicMock()
        ), patch.object(
            family_routes, "_load_family_user_controls_payload", return_value=expected
        ):
            result = await family_routes.get_family_user_controls_settings(
                user={"id": "user-123"},
                __=None,
            )

        self.assertEqual(result.childDefaultProfile, "guided")
        self.assertEqual(len(result.children), 1)
        self.assertEqual(result.children[0].permission_profile, "guided")
        self.assertEqual(len(result.tutors), 1)
        self.assertEqual(result.tutors[0].tutor_permission_profile, "teaching")

    async def test_patch_user_controls_smoke(self):
        expected = family_routes.FamilyUserControlsOut(
            childDefaultProfile="standard",
            children=[],
            tutors=[],
        )

        supabase = MagicMock()
        table_chain = MagicMock()
        upsert_chain = MagicMock()
        upsert_chain.execute.return_value = MagicMock(data=[{"family_id": "family-1"}])
        table_chain.upsert.return_value = upsert_chain
        supabase.table.return_value = table_chain

        with patch.object(family_routes, "get_family_id_for_user", return_value="family-1"), patch.object(
            family_routes, "get_admin_client", return_value=supabase
        ), patch.object(
            family_routes, "_user_is_parent_for_family", return_value=True
        ), patch.object(
            family_routes, "_load_family_user_controls_payload", return_value=expected
        ):
            result = await family_routes.patch_family_user_controls_settings(
                body=family_routes.FamilyUserControlsPatchIn(childDefaultProfile="standard"),
                user={"id": "user-123"},
                __=None,
            )

        self.assertEqual(result.childDefaultProfile, "standard")
        supabase.table.assert_called_with("family_user_controls")
        table_chain.upsert.assert_called_once()
        upsert_payload = table_chain.upsert.call_args[0][0]
        self.assertEqual(upsert_payload["family_id"], "family-1")
        self.assertEqual(upsert_payload["child_default_profile"], "standard")

    async def test_patch_user_controls_requires_parent(self):
        with patch.object(family_routes, "get_family_id_for_user", return_value="family-1"), patch.object(
            family_routes, "get_admin_client", return_value=MagicMock()
        ), patch.object(
            family_routes, "_user_is_parent_for_family", return_value=False
        ):
            with self.assertRaises(family_routes.HTTPException) as ctx:
                await family_routes.patch_family_user_controls_settings(
                    body=family_routes.FamilyUserControlsPatchIn(childDefaultProfile="guided"),
                    user={"id": "user-123"},
                    __=None,
                )

        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, "Only parents can update user controls")


if __name__ == "__main__":
    unittest.main()
