#include "simulation.hpp"
#include <crow.h>
#include <iostream>

int main(){
  act::Simulation sim;
  crow::SimpleApp app;
  CROW_ROUTE(app,"/api/health")([]{return crow::response(200,R"({"status":"ok","service":"airport-control-tower","engine":"C++20"})");});
  CROW_ROUTE(app,"/api/simulation/state")([&]{return crow::response(sim.stateJson());});
  CROW_ROUTE(app,"/api/simulation/start").methods("POST"_method)([&]{sim.start();return crow::response(200,sim.stateJson());});
  CROW_ROUTE(app,"/api/simulation/pause").methods("POST"_method)([&]{sim.pause();return crow::response(200,sim.stateJson());});
  CROW_ROUTE(app,"/api/simulation/resume").methods("POST"_method)([&]{sim.resume();return crow::response(200,sim.stateJson());});
  CROW_ROUTE(app,"/api/simulation/reset").methods("POST"_method)([&]{sim.reset();return crow::response(200,sim.stateJson());});
  CROW_ROUTE(app,"/api/simulation/step").methods("POST"_method)([&]{sim.step();return crow::response(200,sim.stateJson());});
  CROW_ROUTE(app,"/api/simulation/speed").methods("POST"_method)([&](const crow::request& req){auto j=crow::json::load(req.body);if(!j||!j.has("speed"))return crow::response(400,R"({"error":"A speed value is required."})");try{int s=(int)j["speed"].i();if(s!=1&&s!=2&&s!=5&&s!=10)return crow::response(400,R"({"error":"speed must be one of 1, 2, 5, or 10."})");sim.speed(s);return crow::response(200,sim.stateJson());}catch(const std::exception&){return crow::response(400,R"({"error":"speed must be a number."})");}});
  CROW_ROUTE(app,"/api/flights").methods("GET"_method)([&]{return crow::response(sim.flightsJson());});
  CROW_ROUTE(app,"/api/flights/random").methods("POST"_method)([&]{sim.randomFlight();return crow::response(201,sim.flightsJson());});
  CROW_ROUTE(app,"/api/flights").methods("POST"_method)([&](const crow::request& req){
    auto j=crow::json::load(req.body);
    if(!j||!j.has("operation")||!j.has("number")||!j.has("fuel"))return crow::response(400,R"({"error":"operation, number, and fuel are required."})");
    try{
      std::string operation(j["operation"].s());
      std::string number(j["number"].s());
      std::string aircraft=j.has("aircraft")?std::string(j["aircraft"].s()):std::string("A320");
      double fuel=j["fuel"].d();
      bool emergency=j.has("emergency")?j["emergency"].b():false;
      int severity=j.has("severity")?(int)j["severity"].i():1;
      sim.manual(operation,number,aircraft,fuel,emergency,severity);
      return crow::response(201,sim.flightsJson());
    }catch(const std::exception&e){return crow::response(400,std::string("{\"error\":\"")+e.what()+"\"}");}
  });
  CROW_ROUTE(app,"/api/runway")([&]{auto j=crow::json::load(sim.stateJson());crow::json::wvalue o;o["status"]=j["runway"].s();o["activeFlights"]=j["activeFlights"].i();o["safe"]=j["activeFlights"].i()<=1;return crow::response(o);});
  CROW_ROUTE(app,"/api/statistics")([&]{return crow::response(sim.statsJson());});
  CROW_ROUTE(app,"/api/events")([&]{return crow::response(sim.eventsJson());});
  CROW_ROUTE(app,"/api/generator")([&]{return crow::response(sim.generatorJson());});
  CROW_ROUTE(app,"/api/generator/config").methods("POST"_method)([&](const crow::request& req){auto j=crow::json::load(req.body);if(!j||!j.has("enabled")||!j.has("arrivalPercent")||!j.has("fuelMin")||!j.has("fuelMax")||!j.has("emergencyPercent")||!j.has("trafficInterval")||!j.has("seed"))return crow::response(400,R"({"error":"All generator settings are required."})");try{sim.configureGenerator(j["enabled"].b(),(int)j["arrivalPercent"].i(),j["fuelMin"].d(),j["fuelMax"].d(),(int)j["emergencyPercent"].i(),(int)j["trafficInterval"].i(),(std::uint32_t)j["seed"].i());return crow::response(200,sim.generatorJson());}catch(const std::exception&e){return crow::response(400,std::string("{\"error\":\"")+e.what()+"\"}");}});
  CROW_ROUTE(app,"/api/scenarios")([&]{return crow::response(sim.scenariosJson());});
  CROW_ROUTE(app,"/api/scenarios/load").methods("POST"_method)([&](const crow::request& req){auto j=crow::json::load(req.body);if(!j||!j.has("scenario"))return crow::response(400,R"({"error":"scenario is required."})");try{std::string s=j["scenario"].s();if(s!="normal"&&s!="heavy"&&s!="overload")return crow::response(400,R"({"error":"scenario must be normal, heavy, or overload."})");sim.loadScenario(s);return crow::response(200,sim.stateJson());}catch(const std::exception&){return crow::response(400,R"({"error":"scenario must be a string."})");}});
  CROW_ROUTE(app,"/api/scenarios/compare").methods("POST"_method)([&]{return crow::response(sim.compare());});
  CROW_ROUTE(app,"/<path>")([](const crow::request&,std::string){return crow::response(404,R"({"error":"API route not found."})");});
  std::cout<<"Airport Control Tower API listening on http://127.0.0.1:8080\n";
  app.port(8080).multithreaded().run();
}
