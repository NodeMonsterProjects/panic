import { ObjectId } from "mongodb";
import mongoose, { Document, Model, Schema } from "mongoose";
import { ObjectUtil } from "./ObjectUtil";
import fs from "fs";
import { TypeUtil } from "./TypeUtil";

export class MongooseUtil {
  /**
   * Checks if the Mongoose Document is Valid
   *
   * @param doc Mongoose Document
   * @returns {boolean}
   */
  public static async isValid(doc: Document): Promise<boolean> {
    try {
      await doc.validate();
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Enable virtual mode on mongoose and enable alias name
   *
   * @param schema
   */
  public static virtualize(schema: Schema): void {
    schema.set("toJSON", {
      virtuals: true,
      transform: (doc, ret) => {
        if (ret._id) delete ret._id;
        if (ret.config_type) delete ret.config_type;

        ret.id = doc._id;
      },
    });
  }

  /**
   * Deep Merge two objects
   *
   * @param obj1 The target object
   * @param obj2 The fulfilled object
   * @param ignoreFields array of field names to ignore (not include)
   * @param parent
   * @returns The merged object
   */
  public static merge<T>(
    obj1: T | any,
    obj2: any,
    ignoreFields: string[] = [],
    parent: T = null
  ): T {
    if (TypeUtil.isScalarValue(obj2)) {
      return obj2;
    }

    const isMongooseDocument = parent
      ? !!parent && typeof parent["$isNew"] === "boolean"
      : !!obj1 && typeof obj1["$isNew"] === "boolean";

    ignoreFields.forEach((invalid_field) => {
      if (invalid_field in obj2) {
        delete obj2[invalid_field];
      }
    });

    //automatic update when edit
    if (obj1 && obj1["modified"]) {
      obj1["modified"] = new Date();
    }

    const convertToObjID = (x) => {
      return typeof x === "string" && x.length === 24 ? new ObjectId(x) : x;
    };
    Object.keys(obj2).forEach((x) => {
      //to avoid changes on created and modified properties
      if (x === "created" || x === "modified") {
        return;
      }

      if (Array.isArray(obj2[x])) {
        //for empty arrays
        if (obj2[x].length === 0) {
          obj1[x] = obj2[x];
          return;
        }

        //Considering Set A for obj2, and Set B for obj1 the target
        if (Array.isArray(obj1[x])) {
          //We get the intersection of Sets (A & B)
          obj1[x] = obj1[x].filter((b) =>
            obj2[x].some((a) => ObjectUtil.isObject(b) && a.id === b.id)
          );

          //and merge
          obj1[x].map((b) =>
            MongooseUtil.merge(
              b,
              obj2[x].find((a) => b.id === a.id)
            )
          );
        } else {
          obj1[x] = [];
        }

        //add new items to set B
        obj2[x]
          .filter((x) => !x.id)
          .forEach((b: object, key: number) => {
            obj1[x].push(b);
          });

        return;
      } else {
        //avoid undefined property
        if (!obj1) {
          obj1 = {};
        }

        if (x === "id") {
          //make sure to fulfil with objectID instance

          //validate before assignment
          if (mongoose.Types.ObjectId.isValid(obj2[x])) {
            obj1["_id"] = convertToObjID(obj2[x]);
          } else {
            obj1["_id"] = new ObjectId();
          }

          if (!isMongooseDocument) {
            delete obj1[x];
          }

          return;
        }
      }

      let isReference = false;
      if (mongoose.Types.ObjectId.isValid(obj1[x])) {
        isReference = true;

        //if mongoose check it's a collection
        if (isMongooseDocument) {
          isReference = obj1[x]["collection"] !== undefined;
        }
      }

      // to edit pre-existing reference
      if (isReference) {
        let objID = null;

        if (obj2[x] && obj2[x].id) {
          objID = convertToObjID(obj2[x].id);
        } else if (mongoose.Types.ObjectId.isValid(obj2[x])) {
          objID = convertToObjID(obj2[x]);
        }

        obj1[x] = objID;

        return;
      }

      if (ObjectUtil.isObject(obj2[x])) {
        //recursive changes on each property of object
        obj1[x] = MongooseUtil.merge(obj1[x], obj2[x], [], obj1);
        return;
      }

      obj1[x] = obj2[x];
    });

    return obj1;
  }

  /**
   * Populates a model/collection from a JSON document in the base/dump directory.
   *
   * @param model The model which corresponds to a collection to populate
   * @param fileName The name of the JSON document to use to populate collection
   */
  public static async populateModel(
    model: Model<any>,
    fileName: string
  ): Promise<void> {
    try {
      const filePath = `${__dirname}/../../base/dump/${fileName}.json`;
      if (!fs.existsSync(filePath)) {
        return;
      }
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const jsonDocument: any[] = JSON.parse(fileContent);

      if (!jsonDocument || jsonDocument.length === 0) {
        return;
      }

      const idsToCheck = jsonDocument
        .map((doc) => {
          if (
            !doc._id ||
            typeof doc._id !== "string" ||
            !ObjectId.isValid(doc._id)
          ) {
            return null;
          }
          return ObjectId.createFromHexString(doc._id);
        })
        .filter((id) => id !== null) as ObjectId[];

      if (idsToCheck.length === 0) {
        return;
      }

      const existingDocs = await model
        .find({ _id: { $in: idsToCheck } }, { _id: 1 })
        .lean();
      const existingIds = new Set(
        existingDocs.map((doc) => doc._id.toString())
      );

      const docsToInsert = jsonDocument.filter((doc) => {
        return (
          doc._id && typeof doc._id === "string" && !existingIds.has(doc._id)
        );
      });

      if (docsToInsert.length > 0) {
        const preparedDocs = docsToInsert.map((doc) => ({
          ...doc,
          _id: ObjectId.createFromHexString(doc._id),
        }));
        await model
          .insertMany(preparedDocs, { ordered: false })
          .catch((err) => {
            if (err.code !== 11000) {
              console.error(
                `Non-duplicate error during insertMany for ${fileName}: ${err}`
              );
            } else {
              console.warn(
                `Duplicate key error during insertMany for ${fileName}, despite pre-check. (Potential race condition?)`
              );
            }
          });
        // Log success based on attempted insertion, acknowledge potential individual errors handled above.
        console.log(
          `Attempted to insert ${docsToInsert.length} new documents from ${fileName}.json`
        );
      }
    } catch (err) {
      console.error(`Failed processing ${fileName}: ${err}`);
    }
  }
}
