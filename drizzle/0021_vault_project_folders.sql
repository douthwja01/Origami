ALTER TABLE "assets" ADD CONSTRAINT "assets_project_folder_filename_unique" UNIQUE("project_id","folder_path","filename");
